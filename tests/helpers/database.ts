import { PGlite } from "@electric-sql/pglite"
import { migrate, migrationsDirectory } from "@/lib/db/migrations"
import type { SqlClient } from "@/lib/db/types"
import { createPgliteClient } from "./pglite"

export async function createMigratedDatabase(): Promise<SqlClient> {
  const database = new PGlite()
  const client = createPgliteClient(database)
  await migrate(client, migrationsDirectory())
  return client
}

export async function seedTenant(
  client: SqlClient,
  name: string,
  userId: string,
): Promise<{ tenantId: string; userId: string }> {
  const tenantId = crypto.randomUUID()
  await client.query("insert into tenants (id, name) values ($1::uuid, $2)", [tenantId, name])
  await client.query(
    "insert into tenant_members (tenant_id, user_id, role) values ($1::uuid, $2, 'owner')",
    [tenantId, userId],
  )
  return { tenantId, userId }
}
