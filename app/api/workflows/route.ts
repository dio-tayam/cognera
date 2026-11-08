import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { emptyWorkflowDefinition, leadFollowUpDefinition } from "@/lib/workflows/definition"
import { workflowIntegrations } from "@/lib/workflows/effects"
import {
  canActivateWorkflows,
  canWriteWorkflows,
  createWorkflow,
  executionEnabled,
  listWorkflows,
} from "@/lib/workflows/store"
import { executionDisabledByEnv } from "@/lib/workflows/worker"

export async function GET() {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const [workflows, enabled] = await Promise.all([
      listWorkflows(access.context.database, access.context),
      executionEnabled(access.context.database),
    ])
    return jsonOk({
      workflows,
      executionEnabled: enabled && !executionDisabledByEnv(),
      integrations: workflowIntegrations(),
      permissions: {
        canWrite: canWriteWorkflows(access.context.role),
        canActivate: canActivateWorkflows(access.context.role),
      },
    })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.list_failed")
    return jsonFromError(error)
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  template: z.enum(["blank", "lead_follow_up"]).default("blank"),
})

export async function POST(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const blocked = await requireMutation("workflow_write", access.context.userId)
    if (blocked) return blocked
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, "invalid_workflow", "Enter a workflow name.")
    const definition =
      parsed.data.template === "lead_follow_up"
        ? leadFollowUpDefinition()
        : emptyWorkflowDefinition()
    const workflow = await createWorkflow(
      access.context.database,
      access.context,
      parsed.data.name,
      definition,
    )
    return jsonOk({ workflow }, 201)
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.create_failed")
    return jsonFromError(error)
  }
}
