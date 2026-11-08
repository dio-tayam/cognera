import { z } from "zod"
import { pageQuerySchema } from "@/lib/http/pagination"

export const leadStatuses = ["new", "contacted", "qualified", "archived"] as const
export const leadSources = ["manual", "contact_form", "referral", "import", "other"] as const
export const leadSorts = ["name", "email", "status", "createdAt", "updatedAt"] as const

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value ? value : null))

export const leadWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(200),
  company: optionalText,
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^[0-9+(). -]{3,40}$/.test(value), {
      message: "Enter a phone number using digits and standard separators.",
    }),
  source: z.enum(leadSources).default("manual"),
  ownerId: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : null)),
})

export const leadPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.email().max(200).optional(),
  company: z.string().trim().max(200).nullable().optional(),
  phone: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .refine((value) => value == null || value === "" || /^[0-9+(). -]{3,40}$/.test(value), {
      message: "Enter a phone number using digits and standard separators.",
    }),
  source: z.enum(leadSources).optional(),
  ownerId: z.string().trim().max(200).nullable().optional(),
  status: z.enum(leadStatuses).optional(),
})

export const leadNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

export const leadListSchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional().default(""),
  status: z.enum(leadStatuses).optional(),
  source: z.enum(leadSources).optional(),
  ownerId: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(leadSorts).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export const publicContactSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email().max(200),
  message: z.string().trim().min(10).max(5000),
  companyWebsite: z.string().trim().max(200).optional(),
})

export type LeadWriteInput = z.infer<typeof leadWriteSchema>
export type LeadPatchInput = z.infer<typeof leadPatchSchema>
export type LeadListQuery = z.infer<typeof leadListSchema>

export const leadPermissions = {
  read: ["owner", "admin", "editor", "member"],
  write: ["owner", "admin", "editor"],
  delete: ["owner", "admin"],
} as const

export type LeadAction = keyof typeof leadPermissions

export function roleAllows(role: string, action: LeadAction): boolean {
  return (leadPermissions[action] as readonly string[]).includes(role)
}
