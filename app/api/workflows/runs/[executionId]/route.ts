import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requireCrmContext, requireMutation, parseUuid } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { executionDetail } from "@/lib/workflows/store"
import {
  cancelWorkflowExecution,
  processWorkflowJobs,
  retryWorkflowExecution,
} from "@/lib/workflows/worker"

type Params = { params: Promise<{ executionId: string }> }

export async function GET(_request: Request, context: Params) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const executionId = parseUuid((await context.params).executionId)
    if (!executionId) return jsonError(400, "invalid_id", "That execution id is not valid.")
    const execution = await executionDetail(access.context.database, access.context, executionId)
    return jsonOk({ execution })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.execution_failed")
    return jsonFromError(error)
  }
}

export async function POST(request: Request, context: Params) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("workflow_run", access.context.userId)
    if (blocked) return blocked
    const executionId = parseUuid((await context.params).executionId)
    if (!executionId) return jsonError(400, "invalid_id", "That execution id is not valid.")
    const parsed = z
      .object({ action: z.enum(["cancel", "retry"]) })
      .safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return jsonError(400, "invalid_action", "That run action is not supported.")
    const { database } = access.context
    if (parsed.data.action === "cancel") {
      const status = await cancelWorkflowExecution(database, access.context, executionId)
      logEvent("info", "workflow.execution_cancel", { executionId, status })
      const execution = await executionDetail(database, access.context, executionId)
      return jsonOk({ status, execution })
    }
    // Retry resumes the same execution on its original version. It does not
    // create a new run, and steps that already succeeded are skipped.
    const status = await retryWorkflowExecution(database, access.context, executionId)
    logEvent("info", "workflow.execution_retry", { executionId })
    await processWorkflowJobs(database, `api:${access.context.userId}`, { limit: 1, executionId })
    const execution = await executionDetail(database, access.context, executionId)
    return jsonOk({ status, execution })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.execution_action_failed")
    return jsonFromError(error)
  }
}
