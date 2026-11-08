import { AppError } from "@/lib/errors"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import { canWriteCms } from "@/lib/cms/schema"

type Scope = { organizationId: string; userId: string }

export type TaxonomyItem = { id: string; name: string; slug: string }

async function roleOf(tx: SqlClient, organizationId: string, userId: string): Promise<string> {
  const result = await tx.query<{ role: string }>(
    "select role from organization_members where organization_id = $1::uuid and user_id = $2",
    [organizationId, userId],
  )
  const role = result.rows[0]?.role
  if (!role) throw new AppError("forbidden", "You do not belong to this organization.", 403)
  return role
}

function asError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const message = error instanceof Error ? error.message : ""
  if (message.includes("duplicate key") || message.includes("slug")) {
    return new AppError("slug_conflict", "That slug is already used in this organization.", 409)
  }
  return new AppError("database_error", "The category or tag could not be saved.", 500)
}

async function listTable(client: SqlClient, scope: Scope, table: "cms_categories" | "cms_tags") {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      const rows = await tx.query<TaxonomyItem>(`select id, name, slug from ${table} order by name`)
      return rows.rows
    },
  )
}

async function createItem(
  client: SqlClient,
  scope: Scope,
  table: "cms_categories" | "cms_tags",
  input: { name: string; slug: string },
) {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = await roleOf(tx, scope.organizationId, scope.userId)
        if (!canWriteCms(role)) throw new AppError("forbidden", "You cannot edit content.", 403)
        const inserted = await tx.query<TaxonomyItem>(
          `insert into ${table} (organization_id, name, slug) values ($1::uuid, $2, $3) returning id, name, slug`,
          [scope.organizationId, input.name, input.slug],
        )
        const row = inserted.rows[0]
        if (!row)
          throw new AppError("database_error", "The category or tag could not be saved.", 500)
        return row
      },
    )
  } catch (error) {
    throw asError(error)
  }
}

export function listCategories(client: SqlClient, scope: Scope) {
  return listTable(client, scope, "cms_categories")
}

export function listTags(client: SqlClient, scope: Scope) {
  return listTable(client, scope, "cms_tags")
}

export function createCategory(
  client: SqlClient,
  scope: Scope,
  input: { name: string; slug: string },
) {
  return createItem(client, scope, "cms_categories", input)
}

export function createTag(client: SqlClient, scope: Scope, input: { name: string; slug: string }) {
  return createItem(client, scope, "cms_tags", input)
}
