import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { allowAuthAttempt } from "@/lib/auth/rate-limit"
import { getAppDatabase } from "@/lib/db/app"
import { parseUuid } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { workflowLimits } from "@/lib/workflows/limits"
import { acceptWebhook, signatureHeader } from "@/lib/workflows/webhook"

/**
 * Signed webhook intake. Server-to-server, so there is no cookie and no origin check.
 * Order: id check, rate limit, size limit (header and streamed body), signature,
 * replay check, JSON object check, then enqueue. A 202 means the execution is stored.
 */
export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  await connection()
  try {
    const workflowId = parseUuid((await context.params).workflowId)
    if (!workflowId) return jsonError(400, "invalid_id", "That workflow id is not valid.")
    const rate = await allowAuthAttempt("webhook", workflowId)
    if (rate === "limited") return jsonError(429, "rate_limited", "Too many requests. Wait and try again.")
    if (rate === "unavailable") return jsonError(503, "unavailable", "The webhook could not be checked.")
    const database = getAppDatabase()
    if (!database) return jsonError(503, "database_unavailable", "The database is not configured.")
    const declared = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(declared) && declared > workflowLimits.webhookBodyBytes) {
      return jsonError(413, "payload_too_large", "The webhook body is too large.")
    }
    const body = await readLimited(request, workflowLimits.webhookBodyBytes)
    if (body === null) return jsonError(413, "payload_too_large", "The webhook body is too large.")
    const outcome = await acceptWebhook(database, {
      workflowId,
      signature: request.headers.get(signatureHeader),
      idempotencyKey: request.headers.get("idempotency-key"),
      body,
    })
    if (!outcome.ok) {
      logEvent("warn", "workflow.webhook_rejected", { workflowId, code: outcome.code })
      return jsonError(outcome.status, outcome.code, outcome.message)
    }
    return jsonOk({ executionId: outcome.executionId }, 202)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.webhook_failed")
    return jsonFromError(error)
  }
}

/** Reads the body without buffering more than the limit. Returns null when it is larger. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
