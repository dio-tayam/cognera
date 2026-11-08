import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { submitPublicContact } from "@/lib/crm/public-contact"
import { jsonError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

const maxBody = 8_000

export async function POST(request: Request) {
  await connection()
  try {
    if (!(await mutationOriginAllowed())) {
      return jsonError(403, "invalid_origin", "The request origin was not accepted.")
    }
    const length = Number(request.headers.get("content-length") ?? "0")
    if (Number.isFinite(length) && length > maxBody) {
      return jsonError(413, "payload_too_large", "The message is too large. No message was sent.")
    }
    const text = await request.text()
    if (text.length > maxBody) {
      return jsonError(413, "payload_too_large", "The message is too large. No message was sent.")
    }
    const body: unknown = text.length === 0 ? null : JSON.parse(text)
    const result = await submitPublicContact(body)
    if (result.status === "invalid") return jsonError(400, "invalid_contact", result.message)
    if (result.status === "limited") return jsonError(429, "rate_limited", result.message)
    if (result.status === "blocked") return jsonError(503, "contact_unavailable", result.message)
    return jsonOk({ accepted: true, message: result.message })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "contact.request_failed")
    return jsonError(400, "invalid_contact", "Check the name, email, and message. No message was sent.")
  }
}
