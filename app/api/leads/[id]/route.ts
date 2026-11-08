import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { parseUuid, requireCrmContext, requireMutation } from "@/lib/crm/context"
import { deleteLead, getLead, updateLead } from "@/lib/crm/leads"
import { leadPatchSchema } from "@/lib/crm/schema"
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
    const detail = await getLead(access.context.database, access.context, id)
    return jsonOk(detail)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.read_failed")
    return jsonFromError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That lead id is not valid.")
    const body: unknown = await request.json().catch(() => null)
    const parsed = leadPatchSchema.safeParse(body)
    if (!parsed.success) return jsonError(400, "invalid_lead", "Check the lead details.")
    const lead = await updateLead(access.context.database, access.context, id, {
      ...parsed.data,
      company: parsed.data.company === "" ? null : parsed.data.company,
      phone: parsed.data.phone === "" ? null : parsed.data.phone,
      ownerId: parsed.data.ownerId === "" ? null : parsed.data.ownerId,
    })
    return jsonOk({ lead })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.update_failed")
    return jsonFromError(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That lead id is not valid.")
    await deleteLead(access.context.database, access.context, id)
    return jsonOk({ deleted: true })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.delete_failed")
    return jsonFromError(error)
  }
}
