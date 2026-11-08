import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { AppError } from "@/lib/errors"
import type { SqlClient } from "@/lib/db/types"
import { workflowLimits } from "@/lib/workflows/limits"
import { enqueueWorkflowExecution } from "@/lib/workflows/worker"

/**
 * Signed webhooks.
 *
 * Header: x-cognera-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 * Optional: idempotency-key: <1-200 visible characters>
 *
 * The timestamp must be within five minutes. Each accepted signature is stored
 * as a nonce, so the same request cannot be replayed inside that window.
 */
export const signatureHeader = "x-cognera-signature"
export const signatureToleranceMs = 5 * 60 * 1000

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`
}

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  now = Date.now(),
): { ok: true; signature: string } | { ok: false } {
  if (header.length > 500) return { ok: false }
  const parts = new Map(
    header
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.includes("="))
      .map((part) => {
        const index = part.indexOf("=")
        return [part.slice(0, index), part.slice(index + 1)] as const
      }),
  )
  const timestamp = parts.get("t")
  const signature = parts.get("v1")
  if (
    !timestamp ||
    !signature ||
    !/^\d{10}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    return { ok: false }
  }
  const skew = Math.abs(now - Number(timestamp) * 1000)
  if (skew > signatureToleranceMs) return { ok: false }
  const expected = Buffer.from(signWebhook(secret, timestamp, body))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    return { ok: false }
  return { ok: true, signature }
}

const payloadSchema = z.record(z.string().max(100), z.unknown())
const idempotencySchema = z.string().regex(/^[\x21-\x7e]{1,200}$/)

export type WebhookOutcome =
  { ok: true; executionId: string } | { ok: false; status: number; code: string; message: string }

function rejected(status: number, code: string, message: string): WebhookOutcome {
  return { ok: false, status, code, message }
}

/** Verifies and queues one webhook delivery. The caller enforces rate limits and reads the body. */
export async function acceptWebhook(
  database: SqlClient,
  input: {
    workflowId: string
    signature: string | null
    idempotencyKey: string | null
    body: string
    now?: number
  },
): Promise<WebhookOutcome> {
  if (Buffer.byteLength(input.body) > workflowLimits.webhookBodyBytes) {
    return rejected(413, "payload_too_large", "The webhook body is too large.")
  }
  const secretRows = await database.query<{
    organization_id: string
    secret: string
    version_id: string
  }>("select * from app_active_webhook_secret($1::uuid)", [input.workflowId])
  const secret = secretRows.rows[0]
  if (!secret) return rejected(404, "not_found", "That webhook is not active.")
  const verified = verifyWebhookSignature(
    secret.secret,
    input.signature ?? "",
    input.body,
    input.now,
  )
  if (!verified.ok)
    return rejected(401, "invalid_signature", "The webhook signature was not accepted.")
  let parsedJson: unknown
  try {
    parsedJson = input.body.trim() ? JSON.parse(input.body) : {}
  } catch {
    return rejected(400, "invalid_payload", "The webhook body must be JSON.")
  }
  const payload = payloadSchema.safeParse(parsedJson)
  if (!payload.success || Array.isArray(parsedJson)) {
    return rejected(400, "invalid_payload", "The webhook body must be a JSON object.")
  }
  let key = `webhook:${input.workflowId}:sig:${verified.signature}`
  if (input.idempotencyKey !== null) {
    const parsedKey = idempotencySchema.safeParse(input.idempotencyKey)
    if (!parsedKey.success) {
      return rejected(400, "invalid_idempotency_key", "The idempotency key is not valid.")
    }
    key = `webhook:${input.workflowId}:key:${parsedKey.data}`
  }
  const fresh = await database.query<{ recorded: boolean }>(
    "select app_record_webhook_nonce($1::uuid, $2) as recorded",
    [input.workflowId, verified.signature],
  )
  if (fresh.rows[0]?.recorded !== true) {
    return rejected(409, "replayed", "That webhook was already accepted.")
  }
  try {
    const executionId = await enqueueWorkflowExecution(database, {
      organizationId: secret.organization_id,
      workflowId: input.workflowId,
      versionId: secret.version_id,
      trigger: "webhook",
      payload: { webhook: payload.data },
      idempotencyKey: key,
      test: false,
    })
    return { ok: true, executionId }
  } catch (error) {
    if (error instanceof AppError) return rejected(error.status, error.code, error.message)
    throw error
  }
}
