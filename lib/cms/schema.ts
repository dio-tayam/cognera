import { can } from "@/lib/auth/permissions"
import { z } from "zod"
import { cmsStatuses, contentDocumentSchema } from "@/lib/cms/document"

export const cmsKindSchema = z.enum(["page", "post"])
export type CmsKind = z.infer<typeof cmsKindSchema>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

export const cmsWriteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase slug."),
  excerpt: optionalText(300),
  document: contentDocumentSchema,
  categoryId: z.uuid().nullable().optional(),
  tagIds: z.array(z.uuid()).max(20).optional(),
  featuredMediaId: z.uuid().nullable().optional(),
  seoTitle: optionalText(70),
  metaDescription: optionalText(160),
  canonicalUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))
    .refine(
      (value) => value === null || value.startsWith("https://"),
      "Use an https canonical URL.",
    ),
  status: z.enum(cmsStatuses).optional(),
  publishAt: z.string().datetime().nullable().optional(),
})

export const cmsPatchSchema = cmsWriteSchema.partial()

export function canWriteCms(role: string): boolean {
  return can(role, "content.edit")
}

export function canPublishCms(role: string): boolean {
  return can(role, "content.publish")
}
