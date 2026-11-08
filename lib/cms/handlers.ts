import "server-only"
import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireCrmContext, requireMutation, parseUuid } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import {
  canPublishCms,
  canWriteCms,
  cmsPatchSchema,
  cmsWriteSchema,
  type CmsKind,
} from "@/lib/cms/schema"
import {
  createContent,
  deleteContent,
  getContent,
  listContent,
  listRevisions,
  restoreRevision,
  updateContent,
} from "@/lib/cms/store"

function scopeOf(context: { organizationId: string; userId: string }) {
  return { organizationId: context.organizationId, userId: context.userId }
}

export function cmsCollection(kind: CmsKind) {
  return {
    async GET() {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const items = await listContent(access.context.database, scopeOf(access.context), kind)
        return jsonOk({
          items,
          permissions: {
            canWrite: canWriteCms(access.context.role),
            canPublish: canPublishCms(access.context.role),
          },
        })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.list_failed")
        return jsonFromError(error)
      }
    },
    async POST(request: Request) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const blocked = await requireMutation("lead_write", access.context.userId)
        if (blocked) return blocked
        const parsed = cmsWriteSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success)
          return jsonError(400, "invalid_content", "Check the title, slug, and content.")
        const entry = await createContent(
          access.context.database,
          scopeOf(access.context),
          kind,
          parsed.data,
        )
        return jsonOk({ entry }, 201)
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.create_failed")
        return jsonFromError(error)
      }
    },
  }
}

export function cmsItem(kind: CmsKind) {
  return {
    async GET(_request: Request, context: { params: Promise<{ id: string }> }) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const id = parseUuid((await context.params).id)
        if (!id) return jsonError(400, "invalid_id", "That content id is not valid.")
        const entry = await getContent(access.context.database, scopeOf(access.context), kind, id)
        return jsonOk({ entry })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.read_failed")
        return jsonFromError(error)
      }
    },
    async PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const blocked = await requireMutation("lead_write", access.context.userId)
        if (blocked) return blocked
        const id = parseUuid((await context.params).id)
        if (!id) return jsonError(400, "invalid_id", "That content id is not valid.")
        const parsed = cmsPatchSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) return jsonError(400, "invalid_content", "Check the content details.")
        const entry = await updateContent(
          access.context.database,
          scopeOf(access.context),
          kind,
          id,
          parsed.data,
        )
        return jsonOk({ entry })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.update_failed")
        return jsonFromError(error)
      }
    },
    async DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const blocked = await requireMutation("lead_write", access.context.userId)
        if (blocked) return blocked
        const id = parseUuid((await context.params).id)
        if (!id) return jsonError(400, "invalid_id", "That content id is not valid.")
        await deleteContent(access.context.database, scopeOf(access.context), kind, id)
        return jsonOk({ deleted: true })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.delete_failed")
        return jsonFromError(error)
      }
    },
  }
}

export function cmsRevisions(kind: CmsKind) {
  return {
    async GET(_request: Request, context: { params: Promise<{ id: string }> }) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const id = parseUuid((await context.params).id)
        if (!id) return jsonError(400, "invalid_id", "That content id is not valid.")
        const revisions = await listRevisions(
          access.context.database,
          scopeOf(access.context),
          kind,
          id,
        )
        return jsonOk({ revisions })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.revisions_failed")
        return jsonFromError(error)
      }
    },
  }
}

export function cmsRestore(kind: CmsKind) {
  return {
    async POST(
      _request: Request,
      context: { params: Promise<{ id: string; revisionId: string }> },
    ) {
      await connection()
      try {
        const access = await requireCrmContext()
        if (!access.ok) return access.response
        const blocked = await requireMutation("lead_write", access.context.userId)
        if (blocked) return blocked
        const params = await context.params
        const id = parseUuid(params.id)
        const revisionId = parseUuid(params.revisionId)
        if (!id || !revisionId)
          return jsonError(400, "invalid_id", "That revision id is not valid.")
        const entry = await restoreRevision(
          access.context.database,
          scopeOf(access.context),
          kind,
          id,
          revisionId,
        )
        return jsonOk({ entry })
      } catch (error) {
        unstable_rethrow(error)
        logEvent("error", "cms.restore_failed")
        return jsonFromError(error)
      }
    },
  }
}
