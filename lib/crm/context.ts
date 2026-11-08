import "server-only"
import { cookies } from "next/headers"
import { z } from "zod"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { allowAuthAttempt, type AuthAttempt } from "@/lib/auth/rate-limit"
import { getSessionUser } from "@/lib/auth/session-user"
import { getAppDatabase } from "@/lib/db/app"
import { jsonError } from "@/lib/http/json"
import { organizationCookie } from "@/lib/org/cookie"
import { isPreviewableRole, rolePreviewCookie } from "@/lib/org/role-preview"
import type { SqlClient } from "@/lib/db/types"

export type CrmContext = {
  database: SqlClient
  organizationId: string
  userId: string
  role: string
}

export async function requireCrmContext(): Promise<
  { ok: true; context: CrmContext } | { ok: false; response: Response }
> {
  const user = await getSessionUser()
  if (!user)
    return { ok: false, response: jsonError(401, "unauthenticated", "Sign in to continue.") }

  const database = getAppDatabase()
  if (!database) {
    return {
      ok: false,
      response: jsonError(503, "database_unavailable", "The database is not configured."),
    }
  }

  let memberships: { rows: { id: string; role: string }[] }
  try {
    memberships = await database.query<{ id: string; role: string }>(
      "select id, role from app_organizations_for_user($1)",
      [user.id],
    )
  } catch {
    return {
      ok: false,
      response: jsonError(503, "database_unavailable", "The database could not be reached."),
    }
  }
  if (memberships.rows.length === 0) {
    return {
      ok: false,
      response: jsonError(
        409,
        "organization_required",
        "Create an organization before using leads.",
      ),
    }
  }

  const cookieStore = await cookies()
  const requested = cookieStore.get(organizationCookie)?.value
  const selected =
    memberships.rows.find((row) => row.id === requested) ??
    (memberships.rows.length === 1 ? memberships.rows[0] : undefined)
  if (!selected) {
    return {
      ok: false,
      response: jsonError(
        409,
        "organization_required",
        "Choose an organization before using leads.",
      ),
    }
  }

  let role = selected.role
  if (role === "owner") {
    const preview = cookieStore.get(rolePreviewCookie)?.value
    if (isPreviewableRole(preview)) role = preview
  }

  return {
    ok: true,
    context: { database, organizationId: selected.id, userId: user.id, role },
  }
}

export async function requireMutation(
  attempt: AuthAttempt,
  subject: string,
): Promise<Response | null> {
  if (!(await mutationOriginAllowed())) {
    return jsonError(403, "invalid_origin", "The request origin was not accepted.")
  }
  const rate = await allowAuthAttempt(attempt, subject)
  if (rate === "limited")
    return jsonError(429, "rate_limited", "Too many requests. Wait and try again.")
  if (rate === "unavailable") {
    return jsonError(
      503,
      "rate_limit_unavailable",
      "The request was not attempted because rate limiting is unavailable.",
    )
  }
  return null
}

export function parseUuid(id: string): string | null {
  const parsed = z.uuid().safeParse(id)
  return parsed.success ? parsed.data : null
}
