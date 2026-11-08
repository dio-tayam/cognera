"use server"

import { cookies } from "next/headers"
import { z } from "zod"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { createServiceRoleClient } from "@/lib/auth/service-role"
import { getSessionUser } from "@/lib/auth/session-user"
import { getAppDatabase } from "@/lib/db/app"
import { safeDatabaseMessage } from "@/lib/errors"
import type { OperationState } from "@/lib/forms/schemas"
import { organizationCookie } from "@/lib/org/cookie"
import { organizationSchema } from "@/lib/org/schema"
import { acceptInvitation, createOrganization, deleteAccount } from "@/lib/org/store"

const createOrganizationInput = organizationSchema.pick({ name: true, slug: true })
const deleteAccountInput = z.object({
  confirmation: z.literal("delete", { error: "Type delete to confirm." }),
})

function rejected(message: string): OperationState {
  return { status: "rejected", message, at: Date.now() }
}

function blocked(message: string): OperationState {
  return { status: "blocked", message, at: Date.now() }
}

export async function createOrganizationAction(
  _previous: OperationState,
  values: { name: string; slug: string },
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) return rejected("The request origin was not accepted.")
  const parsed = createOrganizationInput.safeParse(values)
  if (!parsed.success)
    return { status: "invalid", message: "Check the organization name and slug.", at: Date.now() }

  const user = await getSessionUser()
  if (!user) return blocked("Sign in before creating an organization. Nothing was created.")
  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured. Nothing was created.")

  try {
    const id = await createOrganization(database, { ...parsed.data, userId: user.id })
    const cookieStore = await cookies()
    cookieStore.set(organizationCookie, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })
  } catch (error) {
    return rejected(safeDatabaseMessage(error))
  }

  return { status: "success", message: "Organization created.", at: Date.now() }
}

export async function switchOrganizationAction(organizationId: string): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) return rejected("The request origin was not accepted.")
  const parsed = z.uuid().safeParse(organizationId)
  if (!parsed.success) return rejected("That organization id is not valid.")

  const user = await getSessionUser()
  if (!user) return blocked("Sign in before switching organizations.")
  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured.")

  const membership = await database.query<{ id: string }>(
    `select id from app_organizations_for_user($1) where id = $2::uuid`,
    [user.id, parsed.data],
  )
  if (!membership.rows[0]) return rejected("You are not a member of that organization.")

  const cookieStore = await cookies()
  cookieStore.set(organizationCookie, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  return { status: "success", message: "Organization switched.", at: Date.now() }
}

export async function deleteAccountAction(
  _previous: OperationState,
  values: { confirmation: string },
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) return rejected("The request origin was not accepted.")
  const parsed = deleteAccountInput.safeParse(values)
  if (!parsed.success) {
    return {
      status: "invalid",
      message: "Type delete to confirm. Nothing was deleted.",
      at: Date.now(),
    }
  }

  const user = await getSessionUser()
  if (!user) return blocked("Sign in before deleting an account. Nothing was deleted.")
  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured. Nothing was deleted.")

  try {
    await deleteAccount(database, user.id)
  } catch (error) {
    return rejected(safeDatabaseMessage(error))
  }

  const admin = createServiceRoleClient()
  if (!admin) {
    return blocked(
      "Memberships were removed and the profile was marked deleted. Supabase Auth deletion is blocked because the service role is not configured, so the login can still exist.",
    )
  }

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return blocked(
      "Memberships were removed. The auth provider did not delete the login, so the account deletion is incomplete.",
    )
  }

  const cookieStore = await cookies()
  cookieStore.delete(organizationCookie)
  return { status: "success", message: "The account was deleted.", at: Date.now() }
}

export async function acceptInvitationAction(
  _previous: OperationState,
  values: { token: string },
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) return rejected("The request origin was not accepted.")
  const parsed = z.object({ token: z.string().trim().min(20).max(200) }).safeParse(values)
  if (!parsed.success)
    return { status: "invalid", message: "Enter the invitation token.", at: Date.now() }

  const user = await getSessionUser()
  if (!user?.email)
    return blocked("Sign in with the invited email before accepting. Nothing was changed.")
  const database = getAppDatabase()
  if (!database) return blocked("The database is not configured. Nothing was changed.")

  try {
    const organizationId = await acceptInvitation(database, {
      token: parsed.data.token,
      userId: user.id,
      email: user.email,
    })
    const cookieStore = await cookies()
    cookieStore.set(organizationCookie, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })
  } catch (error) {
    return rejected(safeDatabaseMessage(error))
  }

  return { status: "success", message: "Invitation accepted.", at: Date.now() }
}
