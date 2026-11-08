import { organizationRoles } from "@/lib/org/schema"

/**
 * Role-based permissions. Client-safe and the single source of truth for the
 * interface and API checks. They mirror the database row-level-security
 * policies (editor+ writes tenant data, admin+ publishes, deletes and manages
 * members, owner alone deletes the organization), which stay the final gate.
 */

export type Role = (typeof organizationRoles)[number]
export const roles = organizationRoles

export const permissionGroups = [
  {
    group: "Leads",
    items: [
      { id: "leads.view", label: "View leads and activity" },
      { id: "leads.edit", label: "Create and edit leads, add notes" },
      { id: "leads.delete", label: "Archive and delete leads" },
      { id: "leads.export", label: "Export leads to CSV" },
    ],
  },
  {
    group: "Content",
    items: [
      { id: "content.view", label: "View pages, posts and media" },
      { id: "content.edit", label: "Write drafts and upload media" },
      { id: "content.publish", label: "Publish and unpublish" },
    ],
  },
  {
    group: "Automations",
    items: [
      { id: "workflows.view", label: "View workflows and runs" },
      { id: "workflows.edit", label: "Build workflows and test runs" },
      { id: "workflows.activate", label: "Activate, pause and retry" },
    ],
  },
  {
    group: "AI",
    items: [
      { id: "ai.use", label: "Use the AI workspace" },
      { id: "ai.usage.view", label: "See organization AI usage" },
    ],
  },
  {
    group: "Organization",
    items: [
      { id: "analytics.view", label: "View analytics" },
      { id: "members.view", label: "See team members" },
      { id: "members.invite", label: "Invite members" },
      { id: "members.manage", label: "Change roles and remove members" },
      { id: "integrations.manage", label: "Manage integrations and webhooks" },
      { id: "org.settings", label: "Edit organization settings" },
      { id: "org.delete", label: "Delete the organization" },
    ],
  },
] as const

export type Permission = (typeof permissionGroups)[number]["items"][number]["id"]

const member: Permission[] = [
  "leads.view",
  "content.view",
  "workflows.view",
  "ai.use",
  "ai.usage.view",
  "analytics.view",
  "members.view",
]
const editor: Permission[] = [...member, "leads.edit", "content.edit", "workflows.edit"]
const admin: Permission[] = [
  ...editor,
  "leads.delete",
  "leads.export",
  "content.publish",
  "workflows.activate",
  "members.invite",
  "members.manage",
  "integrations.manage",
  "org.settings",
]
const owner: Permission[] = [...admin, "org.delete"]

const grants: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(owner),
  admin: new Set(admin),
  editor: new Set(editor),
  member: new Set(member),
}

export const roleDescriptions: Record<Role, string> = {
  owner: "Full control, including deleting the organization and granting the owner role.",
  admin: "Runs the workspace: publishing, activation, exports, integrations and team.",
  editor: "Does the work: leads, drafts, media and workflow building.",
  member: "Read access across the workspace, plus the AI assistant.",
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value)
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return isRole(role) && grants[role].has(permission)
}

export function permissionsFor(role: Role): Permission[] {
  return [...grants[role]]
}
