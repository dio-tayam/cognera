import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { listMedia, uploadMedia } from "@/lib/media/library"

export async function GET() {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const items = await listMedia(access.context.database, access.context)
    return jsonOk({ items })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "media.list_failed")
    return jsonFromError(error)
  }
}

export async function POST(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) return jsonError(400, "invalid_media", "Choose an image file.")
    if (file.size > 5_000_000) {
      return jsonError(
        400,
        "invalid_media",
        "The file must be a PNG, JPEG, GIF, or WebP image under 5 MB.",
      )
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const item = await uploadMedia(access.context.database, access.context, {
      filename: file.name,
      bytes,
    })
    return jsonOk({ item }, 201)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "media.upload_failed")
    return jsonFromError(error)
  }
}
