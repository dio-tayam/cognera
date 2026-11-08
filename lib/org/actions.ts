"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { createServiceRoleClient } from "@/lib/auth/service-role"
import { getSessionUser } from "@/lib/auth/session-user"
import { getAppDatabase } from "@/lib/db/app"
import { safeDatabaseMessage } from "@/lib/errors"
import type { OperationState } from "@/lib/forms/schemas"
import { organizationCookie } from "@/lib/org/cookie"
import { rolePreviewCookie, isPreviewableRole } from "@/lib/org/role-preview"
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

  let id: string
  try {
    id = await createOrganization(database, { ...parsed.data, userId: user.id })
  } catch (error) {
    return rejected(safeDatabaseMessage(error))
  }

  const cookieStore = await cookies()
  cookieStore.set(organizationCookie, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  revalidatePath("/dashboard", "layout")
  redirect("/dashboard")
}

/** Switches the active organization cookie. Membership is re-checked here, not trusted from the UI. */
export async function switchOrganizationAction(organizationId: string): Promise<void> {
  if (!(await mutationOriginAllowed())) return
  const parsed = z.uuid().safeParse(organizationId)
  if (!parsed.success) return

  const user = await getSessionUser()
  if (!user) return
  const database = getAppDatabase()
  if (!database) return

  const membership = await database.query<{ id: string }>(
    `select id from app_organizations_for_user($1) where id = $2::uuid`,
    [user.id, parsed.data],
  )
  if (!membership.rows[0]) return

  const cookieStore = await cookies()
  cookieStore.set(organizationCookie, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  revalidatePath("/dashboard", "layout")
  redirect("/dashboard")
}

/**
 * Lets an owner preview the dashboard as a lower role. Re-checks the caller is really the
 * current organization's owner here rather than trusting the client, since this cookie
 * overrides `requireCrmContext`'s role for every permission check in the app.
 */
export async function setRolePreviewAction(role: string): Promise<void> {
  if (!(await mutationOriginAllowed())) return

  const user = await getSessionUser()
  if (!user) return
  const database = getAppDatabase()
  if (!database) return

  const cookieStore = await cookies()
  const organizationId = cookieStore.get(organizationCookie)?.value
  if (!organizationId) return

  const membership = await database.query<{ role: string }>(
    `select role from app_organizations_for_user($1) where id = $2::uuid`,
    [user.id, organizationId],
  )
  const realRole = membership.rows[0]?.role
  if (realRole !== "owner") return

  if (role === "owner") {
    cookieStore.delete(rolePreviewCookie)
  } else if (isPreviewableRole(role)) {
    cookieStore.set(rolePreviewCookie, role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })
  } else {
    return
  }

  revalidatePath("/dashboard", "layout")
  redirect("/dashboard")
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
