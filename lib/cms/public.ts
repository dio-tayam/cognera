import "server-only"
import { z } from "zod"
import { getAppDatabase } from "@/lib/db/app"
import {
  queryPublicPage,
  queryPublicPages,
  queryPublicPost,
  queryPublicPosts,
  type PublicContent,
} from "@/lib/cms/public-query"

export type { PublicContent }

export function publicContentOrganizationId(): string | null {
  const value = process.env.PUBLIC_CONTENT_ORGANIZATION_ID?.trim()
  if (!value || !z.uuid().safeParse(value).success) return null
  return value
}

async function databaseForPublic() {
  const organizationId = publicContentOrganizationId()
  const database = getAppDatabase()
  if (!organizationId || !database) return null
  return { organizationId, database }
}

export async function listPublicPages(): Promise<PublicContent[]> {
  const scope = await databaseForPublic()
  if (!scope) return []
  return queryPublicPages(scope.database, scope.organizationId)
}

export async function getPublicPage(slug: string): Promise<PublicContent | null> {
  const scope = await databaseForPublic()
  if (!scope) return null
  return queryPublicPage(scope.database, scope.organizationId, slug)
}

export async function listPublicPosts(): Promise<PublicContent[]> {
  const scope = await databaseForPublic()
  if (!scope) return []
  return queryPublicPosts(scope.database, scope.organizationId)
}

export async function getPublicPost(slug: string): Promise<PublicContent | null> {
  const scope = await databaseForPublic()
  if (!scope) return null
  return queryPublicPost(scope.database, scope.organizationId, slug)
}
