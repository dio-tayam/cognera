import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requirePermission } from "@/lib/auth/require-permission"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import { exportLeadsCsv } from "@/lib/crm/leads"
import { leadListSchema } from "@/lib/crm/schema"
import { jsonError, jsonFromError } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

export async function GET(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const forbidden = requirePermission(access.context.role, "leads.export")
    if (forbidden) return forbidden
    const blocked = await requireMutation("lead_export", access.context.userId)
    if (blocked) return blocked
    const parsed = leadListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return jsonError(400, "invalid_query", "Check the export filters.")
    const csv = await exportLeadsCsv(access.context.database, access.context, parsed.data)
    return new Response(csv, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="leads.csv"',
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "leads.export_failed")
    return jsonFromError(error)
  }
}
