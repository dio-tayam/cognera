import { z } from "zod"

/**
 * Cognera content documents are JSON, version 1.
 * Blocks are headings, paragraphs, lists, quotes, and images.
 * Text is stored as data and rendered as text, never as HTML.
 * Links may only be http(s) URLs or same-site paths.
 */
const spanSchema = z.object({
  text: z.string().max(20_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: z.string().max(2_000).optional(),
})

export type ContentSpan = z.infer<typeof spanSchema>

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]),
    spans: z.array(spanSchema).max(20),
  }),
  z.object({
    type: z.literal("paragraph"),
    spans: z.array(spanSchema).max(40),
  }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.array(spanSchema).min(1).max(20)).max(50),
  }),
  z.object({
    type: z.literal("quote"),
    spans: z.array(spanSchema).max(20),
  }),
  z.object({
    type: z.literal("image"),
    mediaId: z.uuid(),
    alt: z.string().trim().min(1).max(300),
  }),
])

export type ContentBlock = z.infer<typeof blockSchema>

export const contentDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(blockSchema).max(200),
})

export type ContentDocument = z.infer<typeof contentDocumentSchema>

export function emptyDocument(): ContentDocument {
  return { version: 1, blocks: [{ type: "paragraph", spans: [{ text: "" }] }] }
}

export function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  const trimmed = href.trim()
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\"))
    return trimmed
  try {
    const url = new URL(trimmed)
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString()
  } catch {
    return undefined
  }
  return undefined
}

function sanitizeSpan(span: ContentSpan): ContentSpan {
  return {
    text: span.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""),
    ...(span.bold ? { bold: true } : {}),
    ...(span.italic ? { italic: true } : {}),
    ...(sanitizeHref(span.href) ? { href: sanitizeHref(span.href) } : {}),
  }
}

export function sanitizeDocument(input: ContentDocument): ContentDocument {
  return {
    version: 1,
    blocks: input.blocks.map((block) => {
      if (block.type === "image") return block
      if (block.type === "list") {
        return { ...block, items: block.items.map((item) => item.map(sanitizeSpan)) }
      }
      return { ...block, spans: block.spans.map(sanitizeSpan) }
    }),
  }
}

export function parseDocument(value: unknown): ContentDocument {
  const parsed = contentDocumentSchema.parse(value)
  return sanitizeDocument(parsed)
}

export function parseStoredDocument(body: string): ContentDocument {
  if (!body.trim()) return emptyDocument()
  return parseDocument(JSON.parse(body) as unknown)
}

export const cmsStatuses = ["draft", "review", "scheduled", "published", "archived"] as const
export type CmsStatus = (typeof cmsStatuses)[number]

export function isPubliclyVisible(status: string, publishAt: Date | null, now: Date): boolean {
  if (status === "published") return publishAt === null || publishAt.getTime() <= now.getTime()
  if (status === "scheduled") return publishAt !== null && publishAt.getTime() <= now.getTime()
  return false
}
