import "server-only"
import { allowAuthAttempt } from "@/lib/auth/rate-limit"
import { getAppDatabase } from "@/lib/db/app"
import { AppError } from "@/lib/errors"
import { logEvent } from "@/lib/log/logger"
import { capturePublicLead } from "@/lib/crm/leads"
import { publicContactSchema } from "@/lib/crm/schema"

export type PublicContactResult =
  | { status: "accepted"; message: "Thanks. The message was saved." }
  | { status: "blocked"; message: "No message was sent." }
  | { status: "invalid"; message: string }
  | { status: "limited"; message: "Too many messages. Wait and try again. No message was sent." }

export async function submitPublicContact(input: unknown): Promise<PublicContactResult> {
  const parsed = publicContactSchema.safeParse(input)
  if (!parsed.success) return { status: "invalid", message: "Check the name, email, and message." }

  const organizationId = process.env.CONTACT_ORGANIZATION_ID?.trim()
  if (!organizationId) return { status: "blocked", message: "No message was sent." }
  if (parsed.data.companyWebsite) {
    logEvent("warn", "contact.spam")
    return { status: "accepted", message: "Thanks. The message was saved." }
  }

  const database = getAppDatabase()
  if (!database) return { status: "blocked", message: "No message was sent." }

  const rate = await allowAuthAttempt("contact", parsed.data.email)
  if (rate === "limited") {
    return {
      status: "limited",
      message: "Too many messages. Wait and try again. No message was sent.",
    }
  }
  if (rate === "unavailable") return { status: "blocked", message: "No message was sent." }

  try {
    await capturePublicLead(database, organizationId, parsed.data)
  } catch (error) {
    logEvent("error", "contact.failed", {
      reason: error instanceof AppError ? error.code : "database_error",
    })
    return { status: "blocked", message: "No message was sent." }
  }

  logEvent("info", "contact.saved", { organizationId })
  return { status: "accepted", message: "Thanks. The message was saved." }
}
