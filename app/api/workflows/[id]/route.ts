import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"
import { requireCrmContext, requireMutation, parseUuid, type CrmContext } from "@/lib/crm/context"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { workflowIntegrations } from "@/lib/workflows/effects"
import {
  canActivateWorkflows,
  canWriteWorkflows,
  executionDetail,
  executionEnabled,
  getWorkflowOverview,
  listExecutions,
  revokeWebhookSecret,
  rotateWebhookSecret,
  saveWorkflow,
  setWorkflowActive,
  startWorkflowRun,
} from "@/lib/workflows/store"
import { executionDisabledByEnv, processWorkflowJobs } from "@/lib/workflows/worker"

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Params) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That workflow id is not valid.")
    const [overview, runs, enabled] = await Promise.all([
      getWorkflowOverview(access.context.database, access.context, id),
      listExecutions(access.context.database, access.context, { workflowId: id, limit: 25 }),
      executionEnabled(access.context.database),
    ])
    return jsonOk({
      ...overview,
      runs,
      executionEnabled: enabled && !executionDisabledByEnv(),
      integrations: workflowIntegrations(),
      permissions: {
        canWrite: canWriteWorkflows(overview.role),
        canActivate: canActivateWorkflows(overview.role),
      },
    })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.read_failed")
    return jsonFromError(error)
  }
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  baseVersionNumber: z.number().int().positive().optional(),
  definition: z.unknown(),
})

const actionSchema = z.object({
  action: z.enum(["activate", "deactivate", "test", "run", "rotate-webhook", "revoke-webhook"]),
  input: z.record(z.string().max(100), z.unknown()).optional(),
})

export async function PATCH(request: Request, context: Params) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const id = parseUuid((await context.params).id)
    if (!id) return jsonError(400, "invalid_id", "That workflow id is not valid.")
    const raw = await request.text()
    if (raw.length > 200_000)
      return jsonError(413, "payload_too_large", "The workflow is too large.")
    let body: unknown = null
    try {
      body = JSON.parse(raw)
    } catch {
      return jsonError(400, "invalid_workflow", "The request body must be JSON.")
    }
    if (body && typeof body === "object" && "action" in body) {
      const parsed = actionSchema.safeParse(body)
      if (!parsed.success)
        return jsonError(400, "invalid_action", "That workflow action is not supported.")
      const running = parsed.data.action === "test" || parsed.data.action === "run"
      const blocked = await requireMutation(
        running ? "workflow_run" : "workflow_write",
        access.context.userId,
      )
      if (blocked) return blocked
      return await handleAction(access.context, id, parsed.data)
    }
    const blocked = await requireMutation("workflow_write", access.context.userId)
    if (blocked) return blocked
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success)
      return jsonError(400, "invalid_workflow", "The workflow definition is not valid.")
    const saved = await saveWorkflow(access.context.database, access.context, id, parsed.data)
    if (saved.issues.length > 0) {
      return Response.json(
        {
          ok: false,
          error: { code: "invalid_workflow", message: "Fix the highlighted nodes before saving." },
          issues: saved.issues,
        },
        { status: 400, headers: { "cache-control": "no-store" } },
      )
    }
    return jsonOk({ workflow: saved.workflow, issues: [] })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "workflow.save_failed")
    return jsonFromError(error)
  }
}

async function handleAction(scope: CrmContext, id: string, body: z.infer<typeof actionSchema>) {
  switch (body.action) {
    case "activate":
    case "deactivate": {
      const workflow = await setWorkflowActive(
        scope.database,
        scope,
        id,
        body.action === "activate",
        workflowIntegrations(),
      )
      logEvent("info", `workflow.${body.action}d`, { workflowId: id })
      return jsonOk({ workflow })
    }
    case "rotate-webhook": {
      const secret = await rotateWebhookSecret(scope.database, scope, id)
      logEvent("info", "workflow.webhook_rotated", { workflowId: id })
      return jsonOk({ secret })
    }
    case "revoke-webhook": {
      const revoked = await revokeWebhookSecret(scope.database, scope, id)
      logEvent("info", "workflow.webhook_revoked", { workflowId: id })
      return jsonOk({ revoked })
    }
    case "test":
    case "run": {
      const executionId = await startWorkflowRun(
        scope.database,
        scope,
        id,
        body.action === "test" ? "test" : "manual",
        body.input ?? {},
      )
      // Process this one execution now so the editor can show the result.
      // If the kill switch is on or the organization is at its running limit,
      // the job stays queued for a worker and the editor shows it as queued.
      await processWorkflowJobs(scope.database, `api:${scope.userId}`, { limit: 1, executionId })
      const execution = await executionDetail(scope.database, scope, executionId)
      return jsonOk({ execution })
    }
  }
}
