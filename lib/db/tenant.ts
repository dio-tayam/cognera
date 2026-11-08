import { z } from "zod"
import { AppError } from "@/lib/errors"
import type { SqlClient } from "@/lib/db/types"

export const tenantScopeSchema = z.object({
  tenantId: z.uuid(),
  userId: z.string().trim().min(1).max(200),
})

export type TenantScope = z.infer<typeof tenantScopeSchema>

/**
 * Runs queries as cognera_app with a tenant context proven by membership.
 * Callers must pass the authenticated user id, not an untrusted request field alone.
 */
export async function withTenant<T>(
  client: SqlClient,
  scope: TenantScope,
  fn: (tx: SqlClient) => Promise<T>,
): Promise<T> {
  const parsed = tenantScopeSchema.safeParse(scope)
  if (!parsed.success) {
    throw new AppError("invalid_tenant_scope", "A valid tenant id and user id are required.")
  }

  return client.transaction(async (tx) => {
    await tx.query("set local role cognera_app")
    try {
      await tx.query("select app_set_context($1::uuid, $2)", [
        parsed.data.tenantId,
        parsed.data.userId,
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message.includes("user is not a member of this tenant")) {
        throw new AppError("forbidden", "You do not belong to this tenant.", 403)
      }
      if (message.includes("user id is required")) {
        throw new AppError("invalid_tenant_scope", "A valid tenant id and user id are required.")
      }
      throw error
    }
    return fn(tx)
  })
}
