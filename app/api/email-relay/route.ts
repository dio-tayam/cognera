import { z } from "zod"
import { blankToUndefined } from "@/lib/env/values"
import { readEmailConfig, sendEmail } from "@/lib/email/resend"
import { jsonError, jsonOk } from "@/lib/http/json"

/**
 * Bridges the workflow "send email" node (lib/workflows/effects.ts) to Resend.
 * EMAIL_WEBHOOK_URL must be a public HTTPS URL (SSRF rules reject localhost), so in
 * local dev this route is reached through a tunnel (e.g. `cloudflared tunnel --url
 * http://localhost:3000`), not directly. The shared secret stops randoms on the
 * public tunnel URL from sending mail through your Resend account.
 */
const bodySchema = z.object({
  to: z.email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
})

export async function POST(request: Request): Promise<Response> {
  const secret = blankToUndefined(process.env.EMAIL_RELAY_SECRET)
  if (!secret) {
    return jsonError(503, "relay_unconfigured", "EMAIL_RELAY_SECRET is not set.")
  }
  if (request.headers.get("idempotency-key") === null) {
    return jsonError(400, "missing_idempotency_key", "Expected an idempotency-key header.")
  }
  const provided = request.headers.get("x-relay-secret")
  if (provided !== secret) {
    return jsonError(401, "unauthorized", "Invalid relay secret.")
  }

  const config = readEmailConfig()
  if (!config) {
    return jsonError(503, "resend_unconfigured", "RESEND_API_KEY or RESEND_FROM_EMAIL is not set.")
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(400, "invalid_body", "Expected { to, subject, body }.")
  }

  const result = await sendEmail(
    { to: parsed.data.to, subject: parsed.data.subject, text: parsed.data.body },
    config,
  )
  if (!result.ok) {
    return jsonError(502, "resend_rejected", result.reason)
  }

  return jsonOk({ sent: true })
}
