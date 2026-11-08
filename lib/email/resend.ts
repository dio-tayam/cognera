import "server-only"
import { blankToUndefined } from "@/lib/env/values"

export type EmailConfig = { apiKey: string; from: string }

export function readEmailConfig(): EmailConfig | null {
  const apiKey = blankToUndefined(process.env.RESEND_API_KEY)
  const from = blankToUndefined(process.env.RESEND_FROM_EMAIL)
  if (!apiKey || !from) return null
  return { apiKey, from }
}

export type SendEmailResult = { ok: true } | { ok: false; reason: string }

export async function sendEmail(
  input: { to: string; subject: string; text: string },
  config: EmailConfig | null = readEmailConfig(),
): Promise<SendEmailResult> {
  if (!config) return { ok: false, reason: "Email delivery is not configured." }

  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Email send failed." }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    return { ok: false, reason: `Resend did not accept the email. ${detail}`.trim() }
  }
  return { ok: true }
}
