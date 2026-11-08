import { AppError } from "@/lib/errors"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import {
  parseDocument,
  parseStoredDocument,
  sanitizeDocument,
  type ContentDocument,
} from "@/lib/cms/document"
import { canPublishCms, canWriteCms, type CmsKind } from "@/lib/cms/schema"

type Scope = { organizationId: string; userId: string }

export type CmsEntry = {
  id: string
  kind: CmsKind
  title: string
  slug: string
  excerpt: string | null
  document: ContentDocument
  status: string
  authorId: string | null
  categoryId: string | null
  tagIds: string[]
  featuredMediaId: string | null
  seoTitle: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  publishAt: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

type Row = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string
  status: string
  author_id: string | null
  category_id: string | null
  featured_media_id: string | null
  seo_title: string | null
  meta_description: string | null
  canonical_url: string | null
  publish_at: Date | string | null
  published_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

const tableName = { page: "cms_pages", post: "cms_posts" } as const
const tagTable = { page: "cms_page_tags", post: "cms_post_tags" } as const
const tagColumn = { page: "page_id", post: "post_id" } as const

function stamp(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function asError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("publishing is not permitted")) {
    return new AppError("forbidden", "You cannot publish, schedule, or archive this content.", 403)
  }
  if (
    message.includes("duplicate key") ||
    message.includes("_slug_key") ||
    message.includes("slug")
  ) {
    return new AppError("slug_conflict", "That slug is already used in this organization.", 409)
  }
  if (error instanceof AppError) return error
  return new AppError("database_error", "The content could not be saved.", 500)
}

async function roleOf(tx: SqlClient, organizationId: string, userId: string): Promise<string> {
  const result = await tx.query<{ role: string }>(
    "select role from organization_members where organization_id = $1::uuid and user_id = $2",
    [organizationId, userId],
  )
  const role = result.rows[0]?.role
  if (!role) throw new AppError("forbidden", "You do not belong to this organization.", 403)
  return role
}

async function tagsFor(tx: SqlClient, kind: CmsKind, id: string): Promise<string[]> {
  const result = await tx.query<{ tag_id: string }>(
    `select tag_id from ${tagTable[kind]} where ${tagColumn[kind]} = $1::uuid`,
    [id],
  )
  return result.rows.map((row) => row.tag_id)
}

function toEntry(kind: CmsKind, row: Row, tagIds: string[]): CmsEntry {
  return {
    id: row.id,
    kind,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    document: parseStoredDocument(row.body),
    status: row.status,
    authorId: row.author_id,
    categoryId: row.category_id,
    tagIds,
    featuredMediaId: row.featured_media_id,
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    canonicalUrl: row.canonical_url,
    publishAt: stamp(row.publish_at),
    publishedAt: stamp(row.published_at),
    createdAt: stamp(row.created_at) ?? "",
    updatedAt: stamp(row.updated_at) ?? "",
  }
}

const columns = `id, title, slug, excerpt, body, status, author_id, category_id, featured_media_id,
  seo_title, meta_description, canonical_url, publish_at, published_at, created_at, updated_at`

async function readEntry(tx: SqlClient, kind: CmsKind, id: string): Promise<CmsEntry> {
  const result = await tx.query<Row>(
    `select ${columns} from ${tableName[kind]} where id = $1::uuid`,
    [id],
  )
  const row = result.rows[0]
  if (!row) throw new AppError("not_found", "That content was not found.", 404)
  return toEntry(kind, row, await tagsFor(tx, kind, id))
}

async function writeTags(
  tx: SqlClient,
  kind: CmsKind,
  organizationId: string,
  id: string,
  tagIds: string[],
) {
  await tx.query(`delete from ${tagTable[kind]} where ${tagColumn[kind]} = $1::uuid`, [id])
  for (const tagId of tagIds) {
    await tx.query(
      `insert into ${tagTable[kind]} (organization_id, ${tagColumn[kind]}, tag_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [organizationId, id, tagId],
    )
  }
}

async function writeRevision(
  tx: SqlClient,
  kind: CmsKind,
  organizationId: string,
  entry: CmsEntry,
) {
  await tx.query(
    `insert into cms_revisions (organization_id, target_type, target_id, body)
     values ($1::uuid, $2, $3::uuid, $4)`,
    [organizationId, kind, entry.id, JSON.stringify(entry)],
  )
}

export async function listContent(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
): Promise<CmsEntry[]> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      const rows = await tx.query<Row>(
        `select ${columns} from ${tableName[kind]} order by updated_at desc`,
      )
      const entries: CmsEntry[] = []
      for (const row of rows.rows) entries.push(toEntry(kind, row, await tagsFor(tx, kind, row.id)))
      return entries
    },
  )
}

export async function createContent(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
  input: {
    title: string
    slug: string
    excerpt: string | null
    document: ContentDocument
    categoryId?: string | null
    tagIds?: string[]
    featuredMediaId?: string | null
    seoTitle: string | null
    metaDescription: string | null
    canonicalUrl: string | null
  },
): Promise<CmsEntry> {
  const document = sanitizeDocument(parseDocument(input.document))
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = await roleOf(tx, scope.organizationId, scope.userId)
        if (!canWriteCms(role)) throw new AppError("forbidden", "You cannot edit content.", 403)
        const inserted = await tx.query<{ id: string }>(
          `insert into ${tableName[kind]}
          (organization_id, title, slug, excerpt, body, author_id, category_id, featured_media_id, seo_title, meta_description, canonical_url, status)
         values ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9, $10, $11, 'draft')
         returning id`,
          [
            scope.organizationId,
            input.title,
            input.slug,
            input.excerpt,
            JSON.stringify(document),
            scope.userId,
            input.categoryId ?? null,
            input.featuredMediaId ?? null,
            input.seoTitle,
            input.metaDescription,
            input.canonicalUrl,
          ],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new AppError("database_error", "The content could not be saved.", 500)
        await writeTags(tx, kind, scope.organizationId, id, input.tagIds ?? [])
        const entry = await readEntry(tx, kind, id)
        await writeRevision(tx, kind, scope.organizationId, entry)
        return entry
      },
    )
  } catch (error) {
    throw asError(error)
  }
}

export async function getContent(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
  id: string,
): Promise<CmsEntry> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      return readEntry(tx, kind, id)
    },
  )
}

export async function updateContent(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
  id: string,
  input: Partial<{
    title: string
    slug: string
    excerpt: string | null
    document: ContentDocument
    categoryId: string | null
    tagIds: string[]
    featuredMediaId: string | null
    seoTitle: string | null
    metaDescription: string | null
    canonicalUrl: string | null
    status: string
    publishAt: string | null
  }>,
): Promise<CmsEntry> {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = await roleOf(tx, scope.organizationId, scope.userId)
        if (!canWriteCms(role)) throw new AppError("forbidden", "You cannot edit content.", 403)
        const current = await readEntry(tx, kind, id)
        if (
          input.status &&
          ["published", "scheduled", "archived"].includes(input.status) &&
          !canPublishCms(role)
        ) {
          throw new AppError(
            "forbidden",
            "You cannot publish, schedule, or archive this content.",
            403,
          )
        }
        if (
          ["published", "scheduled", "archived"].includes(current.status) &&
          !canPublishCms(role)
        ) {
          throw new AppError("forbidden", "You cannot change published content.", 403)
        }
        const document = input.document
          ? sanitizeDocument(parseDocument(input.document))
          : current.document
        const status = input.status ?? current.status
        const publishAt = input.publishAt === undefined ? current.publishAt : input.publishAt
        if (status === "scheduled" && !publishAt) {
          throw new AppError("invalid_content", "Choose a publication time before scheduling.", 400)
        }
        const publishedAt =
          status === "published" && !current.publishedAt
            ? new Date().toISOString()
            : current.publishedAt
        await tx.query(
          `update ${tableName[kind]} set
          title = $2, slug = $3, excerpt = $4, body = $5, category_id = $6::uuid, featured_media_id = $7::uuid,
          seo_title = $8, meta_description = $9, canonical_url = $10, status = $11,
          publish_at = $12::timestamptz, published_at = $13::timestamptz, updated_at = now()
         where id = $1::uuid`,
          [
            id,
            input.title ?? current.title,
            input.slug ?? current.slug,
            input.excerpt === undefined ? current.excerpt : input.excerpt,
            JSON.stringify(document),
            input.categoryId === undefined ? current.categoryId : input.categoryId,
            input.featuredMediaId === undefined ? current.featuredMediaId : input.featuredMediaId,
            input.seoTitle === undefined ? current.seoTitle : input.seoTitle,
            input.metaDescription === undefined ? current.metaDescription : input.metaDescription,
            input.canonicalUrl === undefined ? current.canonicalUrl : input.canonicalUrl,
            status,
            publishAt,
            status === "published" ? publishedAt : current.publishedAt,
          ],
        )
        if (input.tagIds) await writeTags(tx, kind, scope.organizationId, id, input.tagIds)
        const entry = await readEntry(tx, kind, id)
        await writeRevision(tx, kind, scope.organizationId, entry)
        return entry
      },
    )
  } catch (error) {
    throw asError(error)
  }
}

export async function deleteContent(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
  id: string,
): Promise<void> {
  await withTenant(client, { tenantId: scope.organizationId, userId: scope.userId }, async (tx) => {
    const role = await roleOf(tx, scope.organizationId, scope.userId)
    if (!canPublishCms(role)) throw new AppError("forbidden", "You cannot delete content.", 403)
    await readEntry(tx, kind, id)
    await tx.query(`delete from ${tagTable[kind]} where ${tagColumn[kind]} = $1::uuid`, [id])
    const removed = await tx.query(`delete from ${tableName[kind]} where id = $1::uuid`, [id])
    if (removed.rowCount === 0) throw new AppError("not_found", "That content was not found.", 404)
  })
}

export async function listRevisions(client: SqlClient, scope: Scope, kind: CmsKind, id: string) {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      await readEntry(tx, kind, id)
      const rows = await tx.query<{ id: string; created_at: Date | string; body: string }>(
        `select id, created_at, body from cms_revisions
       where target_type = $1 and target_id = $2::uuid
       order by created_at desc
       limit 50`,
        [kind, id],
      )
      return rows.rows.map((row) => ({
        id: row.id,
        createdAt: stamp(row.created_at),
        snapshot: row.body,
      }))
    },
  )
}

export async function restoreRevision(
  client: SqlClient,
  scope: Scope,
  kind: CmsKind,
  id: string,
  revisionId: string,
) {
  const loaded = await withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      const current = await readEntry(tx, kind, id)
      const revision = await tx.query<{ body: string }>(
        `select body from cms_revisions where id = $1::uuid and target_type = $2 and target_id = $3::uuid`,
        [revisionId, kind, id],
      )
      const body = revision.rows[0]?.body
      if (!body) throw new AppError("not_found", "That revision was not found.", 404)
      return { status: current.status, snapshot: JSON.parse(body) as CmsEntry }
    },
  )
  return updateContent(client, scope, kind, id, {
    title: loaded.snapshot.title,
    slug: loaded.snapshot.slug,
    excerpt: loaded.snapshot.excerpt,
    document: loaded.snapshot.document,
    categoryId: loaded.snapshot.categoryId,
    tagIds: loaded.snapshot.tagIds,
    featuredMediaId: loaded.snapshot.featuredMediaId,
    seoTitle: loaded.snapshot.seoTitle,
    metaDescription: loaded.snapshot.metaDescription,
    canonicalUrl: loaded.snapshot.canonicalUrl,
    status: loaded.status,
  })
}
