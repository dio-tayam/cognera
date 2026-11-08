import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import { createLead, listLeads } from "@/lib/crm/leads"
import { leadListSchema, leadWriteSchema } from "@/lib/crm/schema"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

export async function GET(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const parsed = leadListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return jsonError(400, "invalid_query", "Check the list filters.")
    const page = await listLeads(access.context.database, access.context, parsed.data)
    return jsonOk(page)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.list_failed")
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
    const body: unknown = await request.json().catch(() => null)
    const parsed = leadWriteSchema.safeParse(body)
    if (!parsed.success) return jsonError(400, "invalid_lead", "Check the lead details.")
    const lead = await createLead(access.context.database, access.context, parsed.data)
    return jsonOk({ lead }, 201)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.create_failed")
    return jsonFromError(error)
  }
}
