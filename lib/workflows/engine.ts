import { AppError, publicErrorDetail } from "@/lib/errors"
import { jsonParam, toJsonValue } from "@/lib/db/json"
import type { SqlClient } from "@/lib/db/types"
import { withTenant, type TenantScope } from "@/lib/db/tenant"
import {
  getWorkflowRun,
  insertWorkflowRun,
  listSucceededStepIds,
  saveWorkflowProgress,
  type WorkflowRunRecord,
} from "@/lib/db/workflow-store"
import { getWorkflow } from "@/lib/workflows/registry"
import type { StepResult, WorkflowDefinition, WorkflowState } from "@/lib/workflows/types"

async function requireRun(
  client: SqlClient,
  scope: TenantScope,
  runId: string,
): Promise<WorkflowRunRecord> {
  const run = await withTenant(client, scope, (tx) => getWorkflowRun(tx, runId))
  if (!run) throw new AppError("workflow_not_found", "That workflow run does not exist.", 404)
  return run
}

function statePatch(result: StepResult): WorkflowState {
  if (result.state === undefined) return {}
  const value = toJsonValue(result.state)
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("invalid_workflow", "A step state patch must be a JSON object.")
  }
  return value as WorkflowState
}

async function executeWorkflow(
  client: SqlClient,
  scope: TenantScope,
  definition: WorkflowDefinition,
  runId: string,
): Promise<WorkflowRunRecord> {
  let run = await requireRun(client, scope, runId)
  const succeeded = await withTenant(client, scope, (tx) => listSucceededStepIds(tx, run.id))
  let state: WorkflowState = { ...run.state }

  for (const [index, step] of definition.steps.entries()) {
    if (succeeded.has(step.id)) continue

    let result: StepResult
    try {
      result = await step.run({
        runId: run.id,
        tenantId: scope.tenantId,
        userId: scope.userId,
        input: run.input,
        state,
      })
    } catch (error) {
      const message = publicErrorDetail(error).slice(0, 2_000)
      await withTenant(client, scope, (tx) =>
        saveWorkflowProgress(tx, {
          runId: run.id,
          stepId: step.id,
          status: "failed",
          state,
          statePatch: {},
          output: null,
          error: message,
          runStatus: "failed",
          runOutput: null,
          runError: message,
        }),
      )
      return requireRun(client, scope, run.id)
    }

    const patch = statePatch(result)
    state = { ...state, ...patch }
    const output = result.output === undefined ? null : toJsonValue(result.output)
    const upcoming = definition.steps.slice(index + 1)
    const finished = upcoming.every((candidate) => succeeded.has(candidate.id))
    await withTenant(client, scope, (tx) =>
      saveWorkflowProgress(tx, {
        runId: run.id,
        stepId: step.id,
        status: "succeeded",
        state,
        statePatch: patch,
        output,
        error: null,
        runStatus: finished ? "succeeded" : "running",
        runOutput: finished ? output : null,
        runError: null,
      }),
    )
    run = await requireRun(client, scope, run.id)
  }

  if (run.status !== "succeeded") {
    await withTenant(client, scope, (tx) =>
      tx.query(
        `update workflow_runs
         set status = 'succeeded', state = $2::jsonb, updated_at = now()
         where id = $1::uuid`,
        [run.id, JSON.stringify(state)],
      ),
    )
    run = await requireRun(client, scope, run.id)
  }

  return run
}

export async function startWorkflow(
  client: SqlClient,
  scope: TenantScope,
  workflowId: string,
  input: unknown,
): Promise<WorkflowRunRecord> {
  const definition = getWorkflow(workflowId)
  const storedInput = jsonParam(toJsonValue(input))
  const run = await withTenant(client, scope, (tx) =>
    insertWorkflowRun(tx, definition.id, storedInput),
  )
  return executeWorkflow(client, scope, definition, run.id)
}

export async function resumeWorkflow(
  client: SqlClient,
  scope: TenantScope,
  runId: string,
): Promise<WorkflowRunRecord> {
  const existing = await requireRun(client, scope, runId)
  if (existing.status === "succeeded") return existing
  const definition = getWorkflow(existing.workflowId)
  if (existing.status === "failed") {
    await withTenant(client, scope, (tx) =>
      tx.query(
        "update workflow_runs set status = 'running', error = null, updated_at = now() where id = $1::uuid",
        [existing.id],
      ),
    )
  }
  return executeWorkflow(client, scope, definition, existing.id)
}
