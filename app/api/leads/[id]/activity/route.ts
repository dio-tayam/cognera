import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { parseUuid, requireCrmContext } from "@/lib/crm/context"
import { leadActivity } from "@/lib/crm/leads"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That lead id is not valid.")
    const activity = await leadActivity(access.context.database, access.context, id)
    return jsonOk({ activity })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.activity_failed")
    return jsonFromError(error)
  }
}
