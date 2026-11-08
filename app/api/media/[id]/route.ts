import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { getSessionUser } from "@/lib/auth/session-user"
import { requireCrmContext, requireMutation, parseUuid } from "@/lib/crm/context"
import { publicContentOrganizationId } from "@/lib/cms/public"
import { getAppDatabase } from "@/lib/db/app"
import { jsonError, jsonFromError } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { deleteMedia, readMemberMedia, readPublicMediaFile } from "@/lib/media/library"

function imageResponse(file: { bytes: Buffer; contentType: string; filename: string }) {
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection()
  try {
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That file id is not valid.")
    const database = getAppDatabase()
    if (!database) return jsonError(503, "database_unavailable", "The database is not configured.")

    const user = await getSessionUser()
    if (user) {
      const access = await requireCrmContext()
      if (access.ok) {
        const memberFile = await readMemberMedia(database, access.context, id)
        if (memberFile) return imageResponse(memberFile)
      }
    }

    const organizationId = publicContentOrganizationId()
    if (!organizationId) return jsonError(404, "not_found", "That file was not found.")
    const publicFile = await readPublicMediaFile(database, organizationId, id)
    if (!publicFile) return jsonError(404, "not_found", "That file was not found.")
    return imageResponse(publicFile)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "media.read_failed")
    return jsonFromError(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That file id is not valid.")
    await deleteMedia(access.context.database, access.context, id)
    return new Response(null, { status: 204 })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "media.delete_failed")
    return jsonFromError(error)
  }
}
