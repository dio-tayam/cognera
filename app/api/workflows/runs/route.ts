import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requireCrmContext, parseUuid } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { executionEnabled, executionStatuses, listExecutions } from "@/lib/workflows/store"
import { executionDisabledByEnv } from "@/lib/workflows/worker"

export async function GET(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const params = new URL(request.url).searchParams
    const status = z
      .enum(executionStatuses)
      .optional()
      .safeParse(params.get("status") || undefined)
    if (!status.success)
      return jsonError(400, "invalid_status", "That run status is not supported.")
    const rawWorkflow = params.get("workflowId")
    const workflowId = rawWorkflow ? parseUuid(rawWorkflow) : null
    if (rawWorkflow && !workflowId)
      return jsonError(400, "invalid_id", "That workflow id is not valid.")
    const [runs, enabled] = await Promise.all([
      listExecutions(access.context.database, access.context, {
        status: status.data,
        workflowId: workflowId ?? undefined,
        limit: 100,
      }),
      executionEnabled(access.context.database),
    ])
    return jsonOk({ runs, executionEnabled: enabled && !executionDisabledByEnv() })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.runs_failed")
    return jsonFromError(error)
  }
}
