import type { SqlClient } from "@/lib/db/types"
import { parseStoredDocument, type ContentDocument } from "@/lib/cms/document"

export type PublicContent = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  document: ContentDocument
  seoTitle: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  featuredMediaId: string | null
  publishedAt: string | null
  updatedAt: string
}

type PublicRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string
  seo_title: string | null
  meta_description: string | null
  canonical_url: string | null
  featured_media_id: string | null
  published_at: Date | string | null
  updated_at: Date | string
}

function toPublic(row: PublicRow): PublicContent {
  const published = row.published_at
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    document: parseStoredDocument(row.body),
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    canonicalUrl: row.canonical_url,
    featuredMediaId: row.featured_media_id,
    publishedAt: published ? new Date(published).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function queryPublicPages(
  client: SqlClient,
  organizationId: string,
): Promise<PublicContent[]> {
  const rows = await client.query<PublicRow>("select * from app_public_pages($1::uuid)", [
    organizationId,
  ])
  return rows.rows.map(toPublic)
}

export async function queryPublicPage(
  client: SqlClient,
  organizationId: string,
  slug: string,
): Promise<PublicContent | null> {
  const rows = await client.query<PublicRow>("select * from app_public_page($1::uuid, $2)", [
    organizationId,
    slug,
  ])
  const row = rows.rows[0]
  return row ? toPublic(row) : null
}

export async function queryPublicPosts(
  client: SqlClient,
  organizationId: string,
): Promise<PublicContent[]> {
  const rows = await client.query<PublicRow>("select * from app_public_posts($1::uuid)", [
    organizationId,
  ])
  return rows.rows.map(toPublic)
}

export async function queryPublicPost(
  client: SqlClient,
  organizationId: string,
  slug: string,
): Promise<PublicContent | null> {
  const rows = await client.query<PublicRow>("select * from app_public_post($1::uuid, $2)", [
    organizationId,
    slug,
  ])
  const row = rows.rows[0]
  return row ? toPublic(row) : null
}

export async function queryPublicMediaVisible(
  client: SqlClient,
  organizationId: string,
  mediaId: string,
): Promise<boolean> {
  const rows = await client.query<{ visible: boolean }>(
    "select app_public_media_visible($1::uuid, $2::uuid) as visible",
    [organizationId, mediaId],
  )
  return rows.rows[0]?.visible === true
}
