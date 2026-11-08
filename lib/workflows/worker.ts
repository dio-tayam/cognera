import { z } from "zod"
import { AppError } from "@/lib/errors"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import { logEvent } from "@/lib/log/logger"
import { validateWorkflowDefinition, type WorkflowDefinition } from "@/lib/workflows/definition"
import { configuredEffects } from "@/lib/workflows/effects"
import { backoffSeconds, workflowLimits } from "@/lib/workflows/limits"
import { runWorkflowGraph, type WorkflowEffects } from "@/lib/workflows/run-graph"

type ClaimedJob = {
  job_id: string
  tenant_id: string
  payload: { executionId?: string }
  attempts: number
  max_attempts: number
}

export type WorkflowTrigger = "manual" | "lead_created" | "webhook" | "schedule" | "test"

const databaseErrors: Array<[string, AppError]> = [
  [
    "workflow quota exceeded",
    new AppError("workflow_quota", "This organization has reached its hourly workflow limit.", 429),
  ],
  [
    "workflow is not active",
    new AppError("workflow_inactive", "Activate the workflow before it can run.", 409),
  ],
  [
    "workflow version is not published",
    new AppError("workflow_inactive", "Activate the workflow before it can run.", 409),
  ],
  [
    "workflow trigger does not match",
    new AppError("trigger_mismatch", "This workflow does not start from that trigger.", 409),
  ],
  [
    "workflow input is too large",
    new AppError("payload_too_large", "The workflow input is too large.", 413),
  ],
  [
    "workflow execution was not found",
    new AppError("not_found", "That execution was not found.", 404),
  ],
  [
    "workflow change is not permitted",
    new AppError("forbidden", "You cannot change workflow runs.", 403),
  ],
  [
    "only failed executions can be retried",
    new AppError("execution_not_failed", "Only a failed run can be retried.", 409),
  ],
  [
    "workflow retry limit reached",
    new AppError("retry_limit", "This run was already retried three times.", 409),
  ],
  [
    "workflow execution cannot move",
    new AppError("invalid_transition", "That change is not allowed for this run.", 409),
  ],
  [
    "workflow activation requires an owner or admin",
    new AppError("forbidden", "Only an owner or admin can activate workflows.", 403),
  ],
]

/** Maps a database exception from a workflow function to a safe API error. */
export function workflowDatabaseError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) return error
  const message = error instanceof Error ? error.message : ""
  for (const [needle, mapped] of databaseErrors) {
    if (message.includes(needle)) return new AppError(mapped.code, mapped.message, mapped.status)
  }
  return new AppError("database_error", fallback, 500)
}

/** Kill switch for one process. The database flag in workflow_runtime stops every worker. */
export function executionDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.WORKFLOW_EXECUTION_DISABLED?.trim() ?? "")
}

export async function enqueueWorkflowExecution(
  client: SqlClient,
  input: {
    organizationId: string
    workflowId: string
    versionId: string
    trigger: WorkflowTrigger
    payload: unknown
    idempotencyKey: string | null
    test: boolean
  },
): Promise<string> {
  try {
    const rows = await client.query<{ id: string }>(
      `select app_enqueue_workflow_execution($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6, $7) as id`,
      [
        input.organizationId,
        input.workflowId,
        input.versionId,
        input.trigger,
        JSON.stringify(input.payload ?? {}),
        input.idempotencyKey,
        input.test,
      ],
    )
    const id = rows.rows[0]?.id
    if (!id)
      throw new AppError("database_error", "The workflow execution could not be queued.", 500)
    return id
  } catch (error) {
    throw workflowDatabaseError(error, "The workflow execution could not be queued.")
  }
}

export type ProcessOptions = {
  limit?: number
  effects?: WorkflowEffects
  executionId?: string
  /** Overrides for tests. */
  limits?: { attemptDurationMs?: number; stepTimeoutMs?: number }
  signal?: AbortSignal
}

export async function processWorkflowJobs(
  client: SqlClient,
  workerId: string,
  options: ProcessOptions = {},
): Promise<number> {
  if (executionDisabledByEnv()) return 0
  await client.query("select app_recover_workflow_jobs($1)", [workflowLimits.leaseStaleSeconds])
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 100)
  let processed = 0
  for (let index = 0; index < limit; index += 1) {
    if (options.signal?.aborted) break
    const claimed = await client.query<ClaimedJob>(
      "select * from app_claim_workflow_job($1, $2::uuid)",
      [workerId, options.executionId ?? null],
    )
    const job = claimed.rows[0]
    if (!job) break
    try {
      await runClaimedJob(client, workerId, job, options)
    } catch (error) {
      // An unexpected error (lost connection, bug) must not lose the job.
      // Release it for a retry; if this also fails, lease recovery picks it up.
      logEvent("error", "workflow.job_crashed", {
        jobId: job.job_id,
        detail: error instanceof Error ? error.message : "unknown",
      })
      await releaseAfterCrash(client, workerId, job).catch(() => undefined)
    }
    processed += 1
  }
  return processed
}

async function releaseAfterCrash(client: SqlClient, workerId: string, job: ClaimedJob) {
  const executionId = job.payload?.executionId
  const dead = job.attempts >= job.max_attempts
  if (executionId) {
    await client.query("select app_workflow_settle_execution($1::uuid, $2, null, $3, $4)", [
      executionId,
      dead ? "failed" : "retry_scheduled",
      "The worker hit an unexpected error.",
      backoffSeconds(job.attempts),
    ])
  }
  await finishJob(
    client,
    job.job_id,
    workerId,
    dead ? "dead" : "retry",
    "The worker hit an unexpected error.",
    backoffSeconds(job.attempts),
  )
}

type ExecutionState = {
  organization_id: string
  status: string
  input: unknown
  definition: unknown
  cancel_requested: boolean
  deadline_passed: boolean
  succeeded_nodes: string[] | null
  step_outputs: Record<string, unknown> | null
}

async function runClaimedJob(
  client: SqlClient,
  workerId: string,
  job: ClaimedJob,
  options: ProcessOptions,
) {
  const executionId = job.payload?.executionId
  if (!executionId || !z.uuid().safeParse(executionId).success) {
    await finishJob(
      client,
      job.job_id,
      workerId,
      "dead",
      "The job payload is missing an execution.",
      0,
    )
    return
  }
  const stateRows = await client.query<ExecutionState>(
    "select * from app_workflow_execution_state($1::uuid)",
    [executionId],
  )
  const state = stateRows.rows[0]
  if (!state) {
    await finishJob(client, job.job_id, workerId, "dead", "The execution was not found.", 0)
    return
  }
  if (state.status === "succeeded" || state.status === "cancelled" || state.status === "failed") {
    // Already settled, for example by a cancellation that raced the claim.
    await finishJob(client, job.job_id, workerId, "succeeded", "", 0)
    return
  }
  if (state.cancel_requested) {
    await settle(client, executionId, "cancelled", null, "The execution was cancelled.", 0)
    await finishJob(client, job.job_id, workerId, "succeeded", "The execution was cancelled.", 0)
    return
  }
  if (state.deadline_passed) {
    await settle(client, executionId, "failed", null, "The execution passed its time limit.", 0)
    await finishJob(client, job.job_id, workerId, "dead", "The execution passed its time limit.", 0)
    return
  }
  const checked = validateWorkflowDefinition(state.definition)
  if (!checked.definition || checked.issues.length > 0) {
    await settle(client, executionId, "failed", null, "The workflow definition is not valid.", 0)
    await finishJob(
      client,
      job.job_id,
      workerId,
      "dead",
      "The workflow definition is not valid.",
      0,
    )
    return
  }
  const marked = await client.query<{ attempt: number | null }>(
    "select app_workflow_mark_running($1::uuid) as attempt",
    [executionId],
  )
  const attempt = marked.rows[0]?.attempt
  if (!attempt) {
    // Cancelled between the state read and now.
    await settle(client, executionId, "cancelled", null, "The execution was cancelled.", 0)
    await finishJob(client, job.job_id, workerId, "succeeded", "The execution was cancelled.", 0)
    return
  }
  const definition: WorkflowDefinition = checked.definition
  const result = await runWorkflowGraph(definition, state.input, {
    executionId,
    completed: new Set(state.succeeded_nodes ?? []),
    priorOutputs: state.step_outputs ?? {},
    limits: options.limits,
    isCancelled: async () => {
      const next = await client.query<{ cancel_requested: boolean }>(
        "select cancel_requested from app_workflow_execution_state($1::uuid)",
        [executionId],
      )
      return next.rows[0]?.cancel_requested === true || options.signal?.aborted === true
    },
    keepLease: async () => {
      const beat = await client.query<{ held: boolean }>(
        "select app_workflow_heartbeat($1::uuid, $2) as held",
        [job.job_id, workerId],
      )
      return beat.rows[0]?.held === true
    },
    effects:
      options.effects ??
      configuredEffects({
        async createFollowUp(step, context) {
          const leadId = z.uuid().safeParse(step.leadId).success ? step.leadId : null
          const rows = await client.query<{ id: string }>(
            `select app_workflow_create_follow_up($1::uuid, $2, $3::uuid, $4, $5, $6) as id`,
            [executionId, step.nodeId, leadId, step.title, step.body, context.idempotencyKey],
          )
          const taskId = rows.rows[0]?.id
          if (!taskId) throw new Error("The follow-up task could not be saved.")
          return { taskId }
        },
      }),
    onStep: async (step) => {
      await client.query(
        "select app_workflow_log_step($1::uuid, $2, $3, $4::jsonb, $5, $6, $7::timestamptz, $8)",
        [
          executionId,
          step.nodeId,
          step.status,
          step.output === undefined || step.output === null ? null : JSON.stringify(step.output),
          step.error,
          attempt,
          step.startedAt.toISOString(),
          step.durationMs,
        ],
      )
    },
  })
  const output = JSON.stringify(result.output)
  if (result.status === "lease_lost") {
    // Another worker owns the job now. Touch nothing.
    logEvent("warn", "workflow.lease_lost", { jobId: job.job_id })
    return
  }
  if (result.status === "succeeded") {
    await settle(client, executionId, "succeeded", output, null, 0)
    await finishJob(client, job.job_id, workerId, "succeeded", "", 0)
    return
  }
  if (result.status === "cancelled") {
    await settle(client, executionId, "cancelled", output, result.error, 0)
    await finishJob(client, job.job_id, workerId, "succeeded", result.error ?? "", 0)
    return
  }
  const message = result.error ?? "The step failed."
  if (result.retryable && job.attempts < job.max_attempts) {
    const delay = backoffSeconds(job.attempts)
    await settle(client, executionId, "retry_scheduled", output, message, delay)
    await finishJob(client, job.job_id, workerId, "retry", message, delay)
    return
  }
  await settle(client, executionId, "failed", output, message, 0)
  await finishJob(client, job.job_id, workerId, "dead", message, 0)
}

async function settle(
  client: SqlClient,
  executionId: string,
  status: "succeeded" | "failed" | "cancelled" | "retry_scheduled",
  output: string | null,
  error: string | null,
  delaySeconds: number,
) {
  await client.query("select app_workflow_settle_execution($1::uuid, $2, $3::jsonb, $4, $5)", [
    executionId,
    status,
    output,
    error,
    delaySeconds,
  ])
}

async function finishJob(
  client: SqlClient,
  jobId: string,
  workerId: string,
  outcome: "succeeded" | "retry" | "dead",
  error: string,
  delaySeconds: number,
) {
  try {
    await client.query("select app_finish_workflow_job($1::uuid, $2, $3, $4, $5)", [
      jobId,
      workerId,
      outcome,
      error,
      delaySeconds,
    ])
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : ""
    if (message.includes("job is not locked by this worker")) {
      logEvent("warn", "workflow.lease_lost", { jobId })
      return
    }
    throw failure
  }
}

/**
 * Long-running worker loop. It polls the database; it does not depend on
 * browser timers or on a request staying open. Stopping the signal lets the
 * current job finish its step and then exits.
 */
export async function runWorkerLoop(
  client: SqlClient,
  workerId: string,
  options: { signal: AbortSignal; idleMs?: number; batch?: number },
): Promise<void> {
  const idleMs = options.idleMs ?? 2_000
  while (!options.signal.aborted) {
    let processed = 0
    try {
      await client.query("select app_dispatch_due_workflow_schedules($1)", [25])
      processed = await processWorkflowJobs(client, workerId, {
        limit: options.batch ?? 25,
        signal: options.signal,
      })
    } catch (error) {
      logEvent("error", "workflow.worker_pass_failed", {
        detail: error instanceof Error ? error.message : "unknown",
      })
    }
    if (processed === 0) await sleep(idleMs, options.signal)
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

type Scope = { organizationId: string; userId: string }

export async function cancelWorkflowExecution(
  client: SqlClient,
  scope: Scope,
  executionId: string,
): Promise<string> {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const rows = await tx.query<{ status: string }>(
          "select app_workflow_cancel($1::uuid) as status",
          [executionId],
        )
        return rows.rows[0]?.status ?? "unknown"
      },
    )
  } catch (error) {
    throw workflowDatabaseError(error, "The run could not be cancelled.")
  }
}

/**
 * Resumes a failed (dead-lettered) execution on its original, immutable version.
 * Steps that already succeeded are not repeated, so a created task or a sent
 * email from an earlier attempt is not duplicated by the retry itself.
 */
export async function retryWorkflowExecution(
  client: SqlClient,
  scope: Scope,
  executionId: string,
): Promise<string> {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const rows = await tx.query<{ status: string }>(
          "select app_workflow_manual_retry($1::uuid) as status",
          [executionId],
        )
        return rows.rows[0]?.status ?? "unknown"
      },
    )
  } catch (error) {
    throw workflowDatabaseError(error, "The run could not be retried.")
  }
}
