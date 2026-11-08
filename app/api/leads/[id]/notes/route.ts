import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { parseUuid, requireCrmContext, requireMutation } from "@/lib/crm/context"
import { addLeadNote } from "@/lib/crm/leads"
import { leadNoteSchema } from "@/lib/crm/schema"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("lead_write", access.context.userId)
    if (blocked) return blocked
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That lead id is not valid.")
    const body: unknown = await request.json().catch(() => null)
    const parsed = leadNoteSchema.safeParse(body)
    if (!parsed.success) return jsonError(400, "invalid_note", "Enter a note.")
    const note = await addLeadNote(access.context.database, access.context, id, parsed.data.body)
    return jsonOk({ note }, 201)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.note_failed")
    return jsonFromError(error)
  }
}
