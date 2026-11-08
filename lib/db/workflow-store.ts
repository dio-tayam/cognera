import { z } from "zod"
import { firstRow, parseRow, timestampSchema } from "@/lib/db/rows"
import type { SqlClient } from "@/lib/db/types"

const runStatuses = ["running", "succeeded", "failed"] as const
const stepStatuses = ["succeeded", "failed"] as const

export type WorkflowRunRecord = {
  id: string
  tenantId: string
  workflowId: string
  status: (typeof runStatuses)[number]
  input: unknown
  state: Record<string, unknown>
  output: unknown
  error: string | null
  createdAt: string
  updatedAt: string
}

export type WorkflowStepRecord = {
  id: string
  runId: string
  tenantId: string
  stepId: string
  status: (typeof stepStatuses)[number]
  statePatch: Record<string, unknown>
  output: unknown
  error: string | null
}

const jsonObject = z.record(z.string(), z.unknown())

const runRowSchema = z
  .object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    workflow_id: z.string(),
    status: z.enum(runStatuses),
    input: z.unknown(),
    state: jsonObject,
    output: z.unknown().nullable(),
    error: z.string().nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .transform((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    workflowId: row.workflow_id,
    status: row.status,
    input: row.input,
    state: row.state,
    output: row.output,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

const stepRowSchema = z
  .object({
    id: z.uuid(),
    run_id: z.uuid(),
    tenant_id: z.uuid(),
    step_id: z.string(),
    status: z.enum(stepStatuses),
    state_patch: jsonObject,
    output: z.unknown().nullable(),
    error: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    runId: row.run_id,
    tenantId: row.tenant_id,
    stepId: row.step_id,
    status: row.status,
    statePatch: row.state_patch,
    output: row.output,
    error: row.error,
  }))

export function parseWorkflowRun(row: unknown): WorkflowRunRecord {
  return parseRow(runRowSchema, row, "workflow run")
}

export async function insertWorkflowRun(
  tx: SqlClient,
  workflowId: string,
  input: string,
): Promise<WorkflowRunRecord> {
  const result = await tx.query(
    `insert into workflow_runs (tenant_id, workflow_id, status, input, state)
     values (current_setting('app.tenant_id', true)::uuid, $1, 'running', $2::jsonb, '{}'::jsonb)
     returning *`,
    [workflowId, input],
  )
  return parseWorkflowRun(firstRow(result.rows, "workflow run"))
}

export async function getWorkflowRun(
  tx: SqlClient,
  runId: string,
): Promise<WorkflowRunRecord | null> {
  const result = await tx.query("select * from workflow_runs where id = $1::uuid", [runId])
  const row = result.rows[0]
  return row === undefined ? null : parseWorkflowRun(row)
}

export async function listSucceededStepIds(tx: SqlClient, runId: string): Promise<Set<string>> {
  const result = await tx.query<{ step_id: string }>(
    "select step_id from workflow_step_runs where run_id = $1::uuid and status = 'succeeded'",
    [runId],
  )
  return new Set(result.rows.map((row) => row.step_id))
}

export async function saveWorkflowProgress(
  tx: SqlClient,
  input: {
    runId: string
    stepId: string
    status: "succeeded" | "failed"
    state: Record<string, unknown>
    statePatch: Record<string, unknown>
    output: unknown
    error: string | null
    runStatus: "running" | "succeeded" | "failed"
    runOutput: unknown
    runError: string | null
  },
): Promise<void> {
  await tx.query(
    `insert into workflow_step_runs
       (tenant_id, run_id, step_id, status, state_patch, output, error, finished_at)
     values (
       current_setting('app.tenant_id', true)::uuid,
       $1::uuid,
       $2,
       $3,
       $4::jsonb,
       $5::jsonb,
       $6,
       now()
     )
     on conflict (run_id, step_id) do update
       set status = excluded.status,
           state_patch = excluded.state_patch,
           output = excluded.output,
           error = excluded.error,
           finished_at = now()`,
    [
      input.runId,
      input.stepId,
      input.status,
      JSON.stringify(input.statePatch),
      input.output === undefined ? null : JSON.stringify(input.output),
      input.error,
    ],
  )
  await tx.query(
    `update workflow_runs
     set status = $2,
         state = $3::jsonb,
         output = $4::jsonb,
         error = $5,
         updated_at = now()
     where id = $1::uuid`,
    [
      input.runId,
      input.runStatus,
      JSON.stringify(input.state),
      input.runOutput === undefined ? null : JSON.stringify(input.runOutput),
      input.runError,
    ],
  )
}

export function parseWorkflowStep(row: unknown): WorkflowStepRecord {
  return parseRow(stepRowSchema, row, "workflow step")
}
