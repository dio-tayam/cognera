import { can, type Permission } from "@/lib/auth/permissions"
import { jsonError } from "@/lib/http/json"

/** Returns a 403 response when the role lacks the permission, otherwise null. */
export function requirePermission(role: string, permission: Permission): Response | null {
  if (can(role, permission)) return null
  return jsonError(403, "forbidden", "Your role does not allow this action. Ask an admin for access.")
}
