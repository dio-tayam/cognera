"use server"

import { cookies } from "next/headers"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { allowAuthAttempt } from "@/lib/auth/rate-limit"
import { getSessionUser } from "@/lib/auth/session-user"
import { getAppDatabase } from "@/lib/db/app"
import { safeDatabaseMessage } from "@/lib/errors"
import { submitPublicContact } from "@/lib/crm/public-contact"
import {
  automationDraftSchema,
  contactSchema,
  documentDraftSchema,
  inviteSchema,
  profileSchema,
  type AutomationDraftInput,
  type ContactInput,
  type DocumentDraftInput,
  type InviteInput,
  type OperationState,
  type ProfileInput,
} from "@/lib/forms/schemas"
import { organizationCookie } from "@/lib/org/cookie"
import { createInvitation } from "@/lib/org/store"
import { newInvitationToken } from "@/lib/org/tokens"

function blocked(message: string): OperationState {
  return { status: "blocked", message, at: Date.now() }
}

function invalid(message: string): OperationState {
  return { status: "invalid", message, at: Date.now() }
}

export async function submitContact(
  _previous: OperationState,
  values: ContactInput,
): Promise<OperationState> {
  const parsed = contactSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the name, email, and message.")
  if (!(await mutationOriginAllowed())) {
    return {
      status: "rejected",
      message: "The request origin was not accepted. No message was sent.",
      at: Date.now(),
    }
  }
  const result = await submitPublicContact(parsed.data)
  if (result.status === "accepted")
    return { status: "success", message: result.message, at: Date.now() }
  if (result.status === "limited")
    return { status: "rejected", message: result.message, at: Date.now() }
  if (result.status === "invalid") return invalid(result.message)
  return blocked(result.message)
}

export async function saveAutomationDraft(
  _previous: OperationState,
  values: AutomationDraftInput,
): Promise<OperationState> {
  const parsed = automationDraftSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the automation name, trigger, and description.")
  return blocked("Automation storage is not connected. This draft was not saved.")
}

export async function saveDocumentDraft(
  _previous: OperationState,
  values: DocumentDraftInput,
): Promise<OperationState> {
  const parsed = documentDraftSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the title and summary.")
  return blocked("Content storage is not connected. This draft was not saved.")
}

export async function inviteTeammate(
  _previous: OperationState,
  values: InviteInput,
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted.", at: Date.now() }
  }
  const parsed = inviteSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the email address and role.")

  const user = await getSessionUser()
  if (!user) return blocked("Team invitations require a signed-in account. No invitation was sent.")
  const attempt = await allowAuthAttempt("invite", user.id)
  if (attempt === "limited") {
    return {
      status: "rejected",
      message: "Too many invitations. Wait and try again.",
      at: Date.now(),
    }
  }
  if (attempt === "unavailable") {
    return blocked("The invitation was not saved because rate limiting is unavailable.")
  }

  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured. No invitation was sent.")
  const token = newInvitationToken()
  const cookieStore = await cookies()
  const organizationId = cookieStore.get(organizationCookie)?.value
  if (!organizationId) {
    return blocked("Create an organization before inviting someone. No invitation was sent.")
  }

  const membership = await database.query<{ id: string }>(
    "select id from app_organizations_for_user($1) where id = $2::uuid",
    [user.id, organizationId],
  )
  if (!membership.rows[0]) {
    return blocked("The selected organization is not one you belong to. No invitation was sent.")
  }

  try {
    await createInvitation(database, {
      organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      actorId: user.id,
      token,
    })
  } catch (error) {
    return { status: "rejected", message: safeDatabaseMessage(error), at: Date.now() }
  }

  return {
    status: "success",
    message: `The invitation was saved. No email was sent. The invited person can accept it with this token: ${token}`,
    at: Date.now(),
  }
}

export async function saveProfile(
  _previous: OperationState,
  values: ProfileInput,
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted.", at: Date.now() }
  }
  const parsed = profileSchema.safeParse(values)
  if (!parsed.success) return invalid("Enter a display name.")

  const user = await getSessionUser()
  if (!user) return blocked("Profile storage requires a signed-in account. Nothing was saved.")
  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured. Nothing was saved.")

  try {
    await database.query("select app_update_profile($1, $2)", [user.id, parsed.data.displayName])
  } catch (error) {
    return { status: "rejected", message: safeDatabaseMessage(error), at: Date.now() }
  }
  return { status: "success", message: "Profile saved.", at: Date.now() }
}
