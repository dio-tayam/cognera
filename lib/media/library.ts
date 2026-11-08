import { AppError } from "@/lib/errors"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import { canPublishCms, canWriteCms } from "@/lib/cms/schema"
import { safeFilename, sniffImage } from "@/lib/media/sniff"
import { createMediaStorage, mediaKey, type MediaStorage } from "@/lib/media/storage"

type Scope = { organizationId: string; userId: string }

export type MediaRecord = {
  id: string
  filename: string
  contentType: string
  byteSize: number
  status: string
  createdAt: string
}

const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

async function roleOf(tx: SqlClient, organizationId: string, userId: string): Promise<string> {
  const result = await tx.query<{ role: string }>(
    "select role from organization_members where organization_id = $1::uuid and user_id = $2",
    [organizationId, userId],
  )
  const role = result.rows[0]?.role
  if (!role) throw new AppError("forbidden", "You do not belong to this organization.", 403)
  return role
}

export async function listMedia(client: SqlClient, scope: Scope): Promise<MediaRecord[]> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      const rows = await tx.query<{
        id: string
        filename: string
        content_type: string | null
        byte_size: number | null
        status: string
        created_at: Date | string
      }>(
        `select id, filename, content_type, byte_size, status, created_at
       from media_assets
       where status = 'stored'
       order by created_at desc`,
      )
      return rows.rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        contentType: row.content_type ?? "",
        byteSize: row.byte_size ?? 0,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      }))
    },
  )
}

export async function uploadMedia(
  client: SqlClient,
  scope: Scope,
  file: { filename: string; bytes: Buffer },
  storage: MediaStorage = createMediaStorage(),
): Promise<MediaRecord> {
  let sniffed
  try {
    sniffed = sniffImage(file.bytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file was not accepted."
    throw new AppError("invalid_media", message, 400)
  }
  const filename = safeFilename(file.filename)
  let key: string | null = null
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = await roleOf(tx, scope.organizationId, scope.userId)
        if (!canWriteCms(role)) throw new AppError("forbidden", "You cannot upload media.", 403)
        const inserted = await tx.query<{ id: string }>(
          `insert into media_assets (organization_id, filename, status, content_type, byte_size)
         values ($1::uuid, $2, 'pending', $3, $4)
         returning id`,
          [scope.organizationId, filename, sniffed.contentType, file.bytes.length],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new AppError("database_error", "The file could not be stored.", 500)
        key = mediaKey(scope.organizationId, id)
        await storage.put(key, file.bytes)
        await tx.query(
          `update media_assets set storage_path = $2, status = 'stored', updated_at = now() where id = $1::uuid`,
          [id, key],
        )
        return {
          id,
          filename,
          contentType: sniffed.contentType,
          byteSize: file.bytes.length,
          status: "stored",
          createdAt: new Date().toISOString(),
        }
      },
    )
  } catch (error) {
    if (key) await storage.delete(key).catch(() => undefined)
    if (error instanceof AppError) throw error
    throw new AppError("database_error", "The file could not be stored.", 500)
  }
}

export async function readMemberMedia(
  client: SqlClient,
  scope: Scope,
  id: string,
  storage: MediaStorage = createMediaStorage(),
): Promise<{ bytes: Buffer; contentType: string; filename: string } | null> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      await roleOf(tx, scope.organizationId, scope.userId)
      const rows = await tx.query<{
        filename: string
        content_type: string | null
        storage_path: string | null
        status: string
      }>(
        `select filename, content_type, storage_path, status from media_assets where id = $1::uuid`,
        [id],
      )
      const row = rows.rows[0]
      if (!row || row.status !== "stored" || !row.content_type || !imageTypes.has(row.content_type))
        return null
      const expected = mediaKey(scope.organizationId, id)
      if (row.storage_path !== expected) return null
      const bytes = await storage.get(expected)
      if (!bytes) return null
      return { bytes, contentType: row.content_type, filename: row.filename }
    },
  )
}

export async function readPublicMediaFile(
  client: SqlClient,
  organizationId: string,
  id: string,
  storage: MediaStorage = createMediaStorage(),
): Promise<{ bytes: Buffer; contentType: string; filename: string } | null> {
  const rows = await client.query<{
    filename: string
    content_type: string
    storage_path: string
  }>("select filename, content_type, storage_path from app_public_media_file($1::uuid, $2::uuid)", [
    organizationId,
    id,
  ])
  const row = rows.rows[0]
  if (!row || !imageTypes.has(row.content_type)) return null
  const expected = mediaKey(organizationId, id)
  if (row.storage_path !== expected) return null
  const bytes = await storage.get(expected)
  if (!bytes) return null
  return { bytes, contentType: row.content_type, filename: row.filename }
}

export async function deleteMedia(
  client: SqlClient,
  scope: Scope,
  id: string,
  storage: MediaStorage = createMediaStorage(),
) {
  const key = await withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      const role = await roleOf(tx, scope.organizationId, scope.userId)
      if (!canPublishCms(role)) throw new AppError("forbidden", "You cannot delete media.", 403)
      const existing = await tx.query<{ storage_path: string | null }>(
        `select storage_path from media_assets where id = $1::uuid and status = 'stored'`,
        [id],
      )
      const stored = existing.rows[0]?.storage_path
      if (!stored) return null
      await tx.query(
        `update media_assets set status = 'deleted', storage_path = null, updated_at = now() where id = $1::uuid`,
        [id],
      )
      return stored
    },
  )
  if (!key) throw new AppError("not_found", "That file was not found.", 404)
  if (key === mediaKey(scope.organizationId, id)) await storage.delete(key)
}
