import { organizationRoles } from "@/lib/org/schema"

export const rolePreviewCookie = "cognera_role_preview"

export type PreviewableRole = Exclude<(typeof organizationRoles)[number], "owner">

/** Roles an owner may preview the dashboard as. Owner itself is not previewable, it's the real default. */
export function isPreviewableRole(value: unknown): value is PreviewableRole {
  return typeof value === "string" && value !== "owner" && (organizationRoles as readonly string[]).includes(value)
}
