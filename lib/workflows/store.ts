import { can } from "@/lib/auth/permissions"
import { AppError } from "@/lib/errors"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import {
  emptyWorkflowDefinition,
  readinessIssues,
  triggerOf,
  validateWorkflowDefinition,
  type IntegrationStatus,
  type WorkflowDefinition,
  type WorkflowIssue,
} from "@/lib/workflows/definition"
import { generateWebhookSecret } from "@/lib/workflows/webhook"
import { enqueueWorkflowExecution, workflowDatabaseError } from "@/lib/workflows/worker"

type Scope = { organizationId: string; userId: string; role: string }

export type WorkflowRecord = {
  id: string
  name: string
  status: string
  versionId: string
  versionNumber: number
  versionStatus: string
  definition: WorkflowDefinition
  publishedVersionId: string | null
  publishedVersionNumber: number | null
  updatedAt: string
}

export type WorkflowVersionSummary = {
  id: string
  versionNumber: number
  status: string
  createdAt: string
  definition: WorkflowDefinition
}

export function canWriteWorkflows(role: string): boolean {
  return can(role, "workflows.edit")
}

export function canActivateWorkflows(role: string): boolean {
  return can(role, "workflows.activate")
}

function asError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("workflow versions are immutable")) {
    return new AppError("immutable_version", "Published workflow versions cannot be edited.", 409)
  }
  if (
    message.includes("workflow_versions_workflow_id_version_number_key") ||
    message.includes("duplicate key")
  ) {
    return new AppError(
      "version_conflict",
      "Someone else saved this workflow. Reload to see their changes.",
      409,
    )
  }
  return workflowDatabaseError(error, "The workflow could not be saved.")
}

function tenant<T>(client: SqlClient, scope: Scope, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return withTenant(client, { tenantId: scope.organizationId, userId: scope.userId }, fn)
}

export async function listWorkflows(client: SqlClient, scope: Scope) {
  return tenant(client, scope, async (tx) => {
    const rows = await tx.query<{
      id: string
      name: string
      status: string
      updated_at: Date | string
      trigger_type: string | null
      version_number: number | null
      last_run_status: string | null
      last_run_at: Date | string | null
    }>(
      `select w.id, w.name, w.status, w.updated_at,
        latest.version_number,
        (
          select node->>'type'
          from jsonb_array_elements(latest.definition->'nodes') node
          where node->>'type' in ('manual', 'lead_created', 'webhook', 'schedule')
          limit 1
        ) as trigger_type,
        run.status as last_run_status,
        run.created_at as last_run_at
       from workflows w
       left join lateral (
         select v.version_number, v.definition from workflow_versions v
         where v.workflow_id = w.id order by v.version_number desc limit 1
       ) latest on true
       left join lateral (
         select e.status, e.created_at from workflow_executions e
         where e.workflow_id = w.id order by e.created_at desc limit 1
       ) run on true
       where w.status <> 'archived'
       order by w.updated_at desc`,
    )
    return rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      triggerType: row.trigger_type,
      versionNumber: row.version_number,
      lastRunStatus: row.last_run_status,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    }))
  })
}

export async function createWorkflow(
  client: SqlClient,
  scope: Scope,
  name: string,
  definition: WorkflowDefinition = emptyWorkflowDefinition(),
): Promise<WorkflowRecord> {
  try {
    return await tenant(client, scope, async (tx) => {
      const role = scope.role
      if (!canWriteWorkflows(role))
        throw new AppError("forbidden", "You cannot edit workflows.", 403)
      const inserted = await tx.query<{ id: string }>(
        `insert into workflows (organization_id, name, status) values ($1::uuid, $2, 'draft') returning id`,
        [scope.organizationId, name],
      )
      const id = inserted.rows[0]?.id
      if (!id) throw new AppError("database_error", "The workflow could not be saved.", 500)
      await tx.query(
        `insert into workflow_versions (organization_id, workflow_id, version_number, status, definition)
         values ($1::uuid, $2::uuid, 1, 'draft', $3::jsonb)`,
        [scope.organizationId, id, JSON.stringify(definition)],
      )
      return readWorkflow(tx, id)
    })
  } catch (error) {
    throw asError(error)
  }
}

async function readWorkflow(tx: SqlClient, id: string): Promise<WorkflowRecord> {
  const rows = await tx.query<{
    id: string
    name: string
    status: string
    version_id: string
    version_number: number
    version_status: string
    definition: WorkflowDefinition
    updated_at: Date | string
    published_id: string | null
    published_number: number | null
  }>(
    `select w.id, w.name, w.status, w.updated_at,
       v.id as version_id, v.version_number, v.status as version_status, v.definition,
       p.id as published_id, p.version_number as published_number
     from workflows w
     join workflow_versions v on v.workflow_id = w.id
     left join workflow_versions p on p.workflow_id = w.id and p.status = 'published'
     where w.id = $1::uuid and w.status <> 'archived'
     order by v.version_number desc
     limit 1`,
    [id],
  )
  const row = rows.rows[0]
  if (!row) throw new AppError("not_found", "That workflow was not found.", 404)
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    versionId: row.version_id,
    versionNumber: row.version_number,
    versionStatus: row.version_status,
    definition: row.definition,
    publishedVersionId: row.published_id,
    publishedVersionNumber: row.published_number,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function getWorkflowRecord(
  client: SqlClient,
  scope: Scope,
  id: string,
): Promise<WorkflowRecord> {
  return tenant(client, scope, async (tx) => {
    return readWorkflow(tx, id)
  })
}

export async function getWorkflowOverview(client: SqlClient, scope: Scope, id: string) {
  return tenant(client, scope, async (tx) => {
    const role = scope.role
    const workflow = await readWorkflow(tx, id)
    const versions = await tx.query<{
      id: string
      version_number: number
      status: string
      created_at: Date | string
      definition: WorkflowDefinition
    }>(
      `select id, version_number, status, created_at, definition
       from workflow_versions where workflow_id = $1::uuid
       order by version_number desc limit 20`,
      [id],
    )
    // Secrets are visible to owners and admins only (RLS). Others see no row.
    const secret = await tx.query<{ created_at: Date | string }>(
      `select created_at from workflow_webhook_secrets where workflow_id = $1::uuid and status = 'active'`,
      [id],
    )
    const limits = await tx.query<{ executions_per_hour: number; max_running: number }>(
      "select executions_per_hour, max_running from workflow_org_limits where organization_id = $1::uuid",
      [scope.organizationId],
    )
    return {
      workflow,
      role,
      versions: versions.rows.map((row): WorkflowVersionSummary => ({
        id: row.id,
        versionNumber: row.version_number,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        definition: row.definition,
      })),
      webhook: {
        visible: canActivateWorkflows(role),
        activeSince: secret.rows[0] ? new Date(secret.rows[0].created_at).toISOString() : null,
      },
      limits: {
        executionsPerHour: limits.rows[0]?.executions_per_hour ?? 100,
        maxRunning: limits.rows[0]?.max_running ?? 5,
      },
    }
  })
}

export async function saveWorkflow(
  client: SqlClient,
  scope: Scope,
  id: string,
  input: { name?: string; definition: unknown; baseVersionNumber?: number },
): Promise<{ workflow: WorkflowRecord; issues: WorkflowIssue[] }> {
  const checked = validateWorkflowDefinition(input.definition)
  if (!checked.definition || checked.issues.length > 0) {
    return { workflow: await getWorkflowRecord(client, scope, id), issues: checked.issues }
  }
  const definition = checked.definition
  try {
    const workflow = await tenant(client, scope, async (tx) => {
      const role = scope.role
      if (!canWriteWorkflows(role))
        throw new AppError("forbidden", "You cannot edit workflows.", 403)
      await tx.query("select id from workflows where id = $1::uuid for update", [id])
      const current = await readWorkflow(tx, id)
      if (
        input.baseVersionNumber !== undefined &&
        input.baseVersionNumber !== current.versionNumber
      ) {
        throw new AppError(
          "version_conflict",
          `Version ${current.versionNumber} was saved after you opened this workflow. Reload to see it.`,
          409,
        )
      }
      if (input.name && input.name !== current.name) {
        await tx.query("update workflows set name = $2, updated_at = now() where id = $1::uuid", [
          id,
          input.name,
        ])
      }
      if (JSON.stringify(current.definition) !== JSON.stringify(definition)) {
        await tx.query(
          `insert into workflow_versions (organization_id, workflow_id, version_number, status, definition)
           values ($1::uuid, $2::uuid, $3, 'draft', $4::jsonb)`,
          [scope.organizationId, id, current.versionNumber + 1, JSON.stringify(definition)],
        )
        await tx.query("update workflows set updated_at = now() where id = $1::uuid", [id])
      }
      return readWorkflow(tx, id)
    })
    return { workflow, issues: [] }
  } catch (error) {
    throw asError(error)
  }
}

/**
 * Activation publishes the latest saved version. Earlier published versions
 * are retired, not edited, and executions keep pointing at the version they ran.
 */
export async function setWorkflowActive(
  client: SqlClient,
  scope: Scope,
  id: string,
  active: boolean,
  integrations: IntegrationStatus = { email: true, ai: true },
) {
  try {
    return await tenant(client, scope, async (tx) => {
      const role = scope.role
      if (!canActivateWorkflows(role)) {
        throw new AppError("forbidden", "Only an owner or admin can activate workflows.", 403)
      }
      await tx.query("select id from workflows where id = $1::uuid for update", [id])
      const current = await readWorkflow(tx, id)
      await tx.query(
        "update scheduled_jobs set status = 'paused', updated_at = now() where workflow_id = $1::uuid and status = 'active'",
        [id],
      )
      if (!active) {
        if (current.status === "active") {
          await tx.query(
            "update workflows set status = 'draft', updated_at = now() where id = $1::uuid",
            [id],
          )
        }
        return readWorkflow(tx, id)
      }
      const checked = validateWorkflowDefinition(current.definition)
      if (!checked.definition || checked.issues.length > 0) {
        throw new AppError("invalid_workflow", "Fix the validation issues before activating.", 400)
      }
      const notReady = readinessIssues(checked.definition, integrations)
      if (notReady.length > 0) {
        throw new AppError(
          "integration_required",
          notReady[0]?.message ?? "Configure the workflow's integrations.",
          409,
        )
      }
      await tx.query(
        `update workflow_versions set status = 'retired'
         where workflow_id = $1::uuid and status = 'published' and id <> $2::uuid`,
        [id, current.versionId],
      )
      if (current.versionStatus !== "published") {
        await tx.query("update workflow_versions set status = 'published' where id = $1::uuid", [
          current.versionId,
        ])
      }
      if (current.status !== "active") {
        await tx.query(
          "update workflows set status = 'active', updated_at = now() where id = $1::uuid",
          [id],
        )
      }
      const trigger = triggerOf(checked.definition)
      if (trigger?.type === "schedule") {
        await tx.query(
          `insert into scheduled_jobs (organization_id, workflow_id, cron, status, next_run_at)
           values ($1::uuid, $2::uuid, $3, 'active', now() + ($4::int * interval '1 minute'))`,
          [
            scope.organizationId,
            id,
            `interval:${trigger.config.intervalMinutes}`,
            trigger.config.intervalMinutes,
          ],
        )
      }
      return readWorkflow(tx, id)
    })
  } catch (error) {
    throw asError(error)
  }
}

export async function rotateWebhookSecret(
  client: SqlClient,
  scope: Scope,
  id: string,
): Promise<string> {
  const secret = generateWebhookSecret()
  await tenant(client, scope, async (tx) => {
    const role = scope.role
    if (!canActivateWorkflows(role))
      throw new AppError("forbidden", "You cannot rotate webhook secrets.", 403)
    const workflow = await readWorkflow(tx, id)
    if (triggerOf(workflow.definition)?.type !== "webhook") {
      throw new AppError(
        "trigger_mismatch",
        "Save a webhook trigger before creating a secret.",
        409,
      )
    }
    await tx.query(
      `update workflow_webhook_secrets set status = 'revoked' where workflow_id = $1::uuid and status = 'active'`,
      [id],
    )
    await tx.query(
      `insert into workflow_webhook_secrets (organization_id, workflow_id, secret, status)
       values ($1::uuid, $2::uuid, $3, 'active')`,
      [scope.organizationId, id, secret],
    )
  })
  return secret
}

export async function revokeWebhookSecret(
  client: SqlClient,
  scope: Scope,
  id: string,
): Promise<boolean> {
  return tenant(client, scope, async (tx) => {
    const role = scope.role
    if (!canActivateWorkflows(role))
      throw new AppError("forbidden", "You cannot revoke webhook secrets.", 403)
    await readWorkflow(tx, id)
    const result = await tx.query(
      `update workflow_webhook_secrets set status = 'revoked' where workflow_id = $1::uuid and status = 'active'`,
      [id],
    )
    return result.rowCount > 0
  })
}

const testLead = () => ({
  id: crypto.randomUUID(),
  name: "Test lead",
  email: "test@example.com",
  source: "manual",
})

/**
 * Test runs use the latest saved version, even an unpublished draft, and are
 * labelled "test". Run now uses the published version of an active manual workflow.
 */
export async function startWorkflowRun(
  client: SqlClient,
  scope: Scope,
  id: string,
  mode: "test" | "manual",
  input: Record<string, unknown> = {},
): Promise<string> {
  const target = await tenant(client, scope, async (tx) => {
    const role = scope.role
    if (!canWriteWorkflows(role)) throw new AppError("forbidden", "You cannot run workflows.", 403)
    const workflow = await readWorkflow(tx, id)
    if (mode === "test") return { versionId: workflow.versionId, workflow }
    if (workflow.status !== "active" || !workflow.publishedVersionId) {
      throw new AppError("workflow_inactive", "Activate the workflow before running it.", 409)
    }
    return { versionId: workflow.publishedVersionId, workflow }
  })
  const payload =
    mode === "test"
      ? { test: true, lead: testLead(), ...input }
      : { manual: true, startedBy: scope.userId, ...input }
  return tenant(client, scope, (tx) =>
    enqueueWorkflowExecution(tx, {
      organizationId: scope.organizationId,
      workflowId: target.workflow.id,
      versionId: target.versionId,
      trigger: mode,
      payload,
      idempotencyKey: null,
      test: mode === "test",
    }),
  )
}

export async function executionEnabled(client: SqlClient): Promise<boolean> {
  const rows = await client.query<{ enabled: boolean }>(
    "select app_workflow_execution_enabled() as enabled",
  )
  return rows.rows[0]?.enabled === true
}

export type ExecutionSummary = {
  id: string
  workflowId: string
  workflowName: string
  versionNumber: number
  status: string
  triggerType: string | null
  error: string | null
  attemptCount: number
  manualRetryCount: number
  deadLettered: boolean
  cancelRequested: boolean
  nextRetryAt: string | null
  createdAt: string
  finishedAt: string | null
}

const summaryColumns = `
  e.id, e.workflow_id, w.name as workflow_name, v.version_number, e.status, e.trigger_type, e.error,
  e.attempt_count, e.manual_retry_count, e.dead_lettered_at, e.cancel_requested_at,
  e.next_retry_at, e.created_at, e.finished_at`

type SummaryRow = {
  id: string
  workflow_id: string
  workflow_name: string
  version_number: number
  status: string
  trigger_type: string | null
  error: string | null
  attempt_count: number
  manual_retry_count: number
  dead_lettered_at: Date | string | null
  cancel_requested_at: Date | string | null
  next_retry_at: Date | string | null
  created_at: Date | string
  finished_at: Date | string | null
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null
}

function toSummary(row: SummaryRow): ExecutionSummary {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    versionNumber: row.version_number,
    status: row.status,
    triggerType: row.trigger_type,
    error: row.error,
    attemptCount: row.attempt_count,
    manualRetryCount: row.manual_retry_count,
    deadLettered: row.dead_lettered_at !== null,
    cancelRequested: row.cancel_requested_at !== null,
    nextRetryAt: iso(row.next_retry_at),
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: iso(row.finished_at),
  }
}

export const executionStatuses = [
  "queued",
  "running",
  "retry_scheduled",
  "succeeded",
  "failed",
  "cancelled",
] as const

export async function listExecutions(
  client: SqlClient,
  scope: Scope,
  filter: { workflowId?: string; status?: (typeof executionStatuses)[number]; limit?: number } = {},
): Promise<ExecutionSummary[]> {
  return tenant(client, scope, async (tx) => {
    const rows = await tx.query<SummaryRow>(
      `select ${summaryColumns}
       from workflow_executions e
       join workflows w on w.id = e.workflow_id
       join workflow_versions v on v.id = e.version_id
       where ($1::uuid is null or e.workflow_id = $1::uuid)
         and ($2::text is null or e.status = $2)
       order by e.created_at desc
       limit $3`,
      [
        filter.workflowId ?? null,
        filter.status ?? null,
        Math.min(Math.max(filter.limit ?? 50, 1), 200),
      ],
    )
    return rows.rows.map(toSummary)
  })
}

export type ExecutionDetail = ExecutionSummary & {
  input: unknown
  output: unknown
  startedAt: string | null
  deadlineAt: string | null
  canRetry: boolean
  canCancel: boolean
  job: {
    status: string
    attempts: number
    maxAttempts: number
    runAfter: string
    lastError: string | null
  } | null
  steps: Array<{
    nodeId: string
    nodeType: string | null
    status: string
    output: unknown
    error: string | null
    attempt: number
    startedAt: string
    durationMs: number | null
  }>
  tasks: Array<{
    id: string
    title: string
    body: string
    leadId: string | null
    createdAt: string
  }>
}

export async function executionDetail(
  client: SqlClient,
  scope: Scope,
  executionId: string,
): Promise<ExecutionDetail> {
  return tenant(client, scope, async (tx) => {
    const role = scope.role
    const rows = await tx.query<
      SummaryRow & {
        input: unknown
        output: unknown
        started_at: Date | string | null
        deadline_at: Date | string | null
        definition: WorkflowDefinition
        workflow_status: string
      }
    >(
      `select ${summaryColumns}, e.input, e.output, e.started_at, e.deadline_at, v.definition, w.status as workflow_status
       from workflow_executions e
       join workflows w on w.id = e.workflow_id
       join workflow_versions v on v.id = e.version_id
       where e.id = $1::uuid`,
      [executionId],
    )
    const execution = rows.rows[0]
    if (!execution) throw new AppError("not_found", "That execution was not found.", 404)
    const nodes = new Map((execution.definition.nodes ?? []).map((node) => [node.id, node]))
    const steps = await tx.query<{
      node_id: string
      status: string
      output: unknown
      error: string | null
      attempt: number
      started_at: Date | string
      duration_ms: number | null
    }>(
      `select node_id, status, output, error, attempt, started_at, duration_ms
       from workflow_execution_steps
       where execution_id = $1::uuid
       order by attempt asc, started_at asc, finished_at asc`,
      [executionId],
    )
    const job = await tx.query<{
      status: string
      attempts: number
      max_attempts: number
      run_after: Date | string
      last_error: string | null
    }>(
      `select status, attempts, max_attempts, run_after, last_error from jobs
       where type = 'workflow.execute' and payload->>'executionId' = $1
       order by created_at desc limit 1`,
      [executionId],
    )
    const tasks = await tx.query<{
      id: string
      title: string
      body: string
      lead_id: string | null
      created_at: Date | string
    }>(
      `select id, title, body, lead_id, created_at from follow_up_tasks
       where execution_id = $1::uuid order by created_at asc`,
      [executionId],
    )
    const summary = toSummary(execution)
    const writer = canWriteWorkflows(role)
    const jobRow = job.rows[0]
    return {
      ...summary,
      input: execution.input,
      output: execution.output,
      startedAt: iso(execution.started_at),
      deadlineAt: iso(execution.deadline_at),
      canRetry:
        writer &&
        summary.status === "failed" &&
        summary.manualRetryCount < 3 &&
        (summary.triggerType === "test" || execution.workflow_status === "active"),
      canCancel:
        writer &&
        ["queued", "running", "retry_scheduled"].includes(summary.status) &&
        !summary.cancelRequested,
      job: jobRow
        ? {
            status: jobRow.status,
            attempts: jobRow.attempts,
            maxAttempts: jobRow.max_attempts,
            runAfter: new Date(jobRow.run_after).toISOString(),
            lastError: jobRow.last_error,
          }
        : null,
      steps: steps.rows.map((step) => {
        const node = nodes.get(step.node_id)
        return {
          nodeId: step.node_id,
          nodeType: node?.type ?? null,
          status: step.status,
          output: step.output,
          error: step.error,
          attempt: step.attempt,
          startedAt: new Date(step.started_at).toISOString(),
          durationMs: step.duration_ms,
        }
      }),
      tasks: tasks.rows.map((task) => ({
        id: task.id,
        title: task.title,
        body: task.body,
        leadId: task.lead_id,
        createdAt: new Date(task.created_at).toISOString(),
      })),
    }
  })
}
