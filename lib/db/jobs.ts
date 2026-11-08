import { z } from "zod"
import { AppError } from "@/lib/errors"
import { jsonParam } from "@/lib/db/json"
import { firstRow, parseRow, timestampSchema } from "@/lib/db/rows"
import type { SqlClient } from "@/lib/db/types"

export const jobStatuses = ["pending", "running", "failed", "succeeded", "dead"] as const
export type JobStatus = (typeof jobStatuses)[number]

export type JobRecord = {
  id: string
  tenantId: string
  type: string
  payload: unknown
  status: JobStatus
  attempts: number
  maxAttempts: number
  runAfter: string
  lockedBy: string | null
  lockedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

const jobRowSchema = z
  .object({
    id: z.uuid(),
    tenant_id: z.uuid(),
    type: z.string(),
    payload: z.unknown(),
    status: z.enum(jobStatuses),
    attempts: z.number().int(),
    max_attempts: z.number().int(),
    run_after: timestampSchema,
    locked_by: z.string().nullable(),
    locked_at: timestampSchema.nullable(),
    last_error: z.string().nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .transform((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

const enqueueSchema = z.object({
  type: z.string().trim().min(1).max(120),
  payload: z.unknown().default({}),
  maxAttempts: z.number().int().min(1).max(25).default(5),
})

function parseJob(row: unknown): JobRecord {
  return parseRow(jobRowSchema, row, "job")
}

export async function enqueueJob(
  tx: SqlClient,
  input: { type: string; payload?: unknown; maxAttempts?: number },
): Promise<JobRecord> {
  const parsed = enqueueSchema.safeParse(input)
  if (!parsed.success) {
    throw new AppError("invalid_job", "Job type and attempt limit are invalid.")
  }

  const result = await tx.query(
    `insert into jobs (tenant_id, type, payload, status, max_attempts)
     values (current_setting('app.tenant_id', true)::uuid, $1, $2::jsonb, 'pending', $3)
     returning *`,
    [parsed.data.type, jsonParam(parsed.data.payload), parsed.data.maxAttempts],
  )
  return parseJob(firstRow(result.rows, "job"))
}

export async function claimJob(tx: SqlClient, workerId: string): Promise<JobRecord | null> {
  const worker = z.string().trim().min(1).max(200).safeParse(workerId)
  if (!worker.success) throw new AppError("invalid_job", "A worker id is required.")

  const result = await tx.query(
    `update jobs
     set status = 'running',
         locked_by = $1,
         locked_at = now(),
         attempts = attempts + 1,
         updated_at = now()
     where id = (
       select id from jobs
       where status in ('pending', 'failed')
         and run_after <= now()
       order by created_at
       for update skip locked
       limit 1
     )
     returning *`,
    [worker.data],
  )
  const row = result.rows[0]
  return row === undefined ? null : parseJob(row)
}

export async function completeJob(tx: SqlClient, jobId: string): Promise<JobRecord> {
  const id = z.uuid().safeParse(jobId)
  if (!id.success) throw new AppError("invalid_job", "A job id is required.")

  const result = await tx.query(
    `update jobs
     set status = 'succeeded',
         locked_by = null,
         locked_at = null,
         updated_at = now()
     where id = $1::uuid
       and status = 'running'
     returning *`,
    [id.data],
  )
  if (result.rows[0] === undefined) {
    throw new AppError("job_not_running", "That job is not running.", 409)
  }
  return parseJob(result.rows[0])
}

export async function failJob(
  tx: SqlClient,
  jobId: string,
  errorMessage: string,
  backoffSeconds?: number,
): Promise<JobRecord> {
  const id = z.uuid().safeParse(jobId)
  if (!id.success) throw new AppError("invalid_job", "A job id is required.")
  const message = z.string().trim().min(1).max(2_000).safeParse(errorMessage)
  if (!message.success) throw new AppError("invalid_job", "A failure message is required.")

  const delay = backoffSeconds ?? 2
  const boundedDelay = z.number().int().min(0).max(86_400).parse(delay)

  const result = await tx.query(
    `update jobs
     set status = case when attempts >= max_attempts then 'dead' else 'failed' end,
         run_after = case
           when attempts >= max_attempts then run_after
           else now() + ($2::int * interval '1 second')
         end,
         locked_by = null,
         locked_at = null,
         last_error = $3,
         updated_at = now()
     where id = $1::uuid
       and status = 'running'
     returning *`,
    [id.data, boundedDelay, message.data],
  )
  if (result.rows[0] === undefined) {
    throw new AppError("job_not_running", "That job is not running.", 409)
  }
  return parseJob(result.rows[0])
}

export async function countJobs(tx: SqlClient): Promise<Record<JobStatus, number>> {
  const result = await tx.query<{ status: JobStatus; count: number }>(
    "select status, count(*)::int as count from jobs group by status",
  )
  const counts: Record<JobStatus, number> = {
    pending: 0,
    running: 0,
    failed: 0,
    succeeded: 0,
    dead: 0,
  }
  for (const row of result.rows) {
    counts[row.status] = row.count
  }
  return counts
}
