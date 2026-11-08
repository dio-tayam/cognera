import { z } from "zod"

export const organizationRoles = ["owner", "admin", "editor", "member"] as const
export const invitationRoles = ["admin", "editor", "member"] as const

export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug."),
  userId: z.string().trim().min(1).max(200),
})

export const leadSchema = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.email(),
})

export const invitationSchema = z.object({
  organizationId: z.uuid(),
  email: z.email(),
  role: z.enum(invitationRoles),
  actorId: z.string().trim().min(1).max(200),
})

export const memberRoleSchema = z.object({
  organizationId: z.uuid(),
  userId: z.string().trim().min(1).max(200),
  role: z.enum(organizationRoles),
  actorId: z.string().trim().min(1).max(200),
})

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(20).max(200),
  userId: z.string().trim().min(1).max(200),
  email: z.email(),
})
