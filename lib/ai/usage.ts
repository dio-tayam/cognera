import type { AiOperationId, AiUsageRow, AiUsageSummary } from "@/lib/ai/catalog"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"

/**
 * Organization-owned usage metrics. Only sizes, timings, model, and outcome
 * are kept. Prompts and outputs are never stored here.
 */

export type UsageScope = {
  organizationId: string
  userId: string
  database: SqlClient | null
}

export type UsageEvent = {
  operation: AiOperationId
  model: string
  status: AiUsageRow["status"]
  errorCode: string | null
  inputChars: number
  outputChars: number
  promptTokens: number | null
  completionTokens: number | null
  durationMs: number
}

const memory = new Map<string, AiUsageRow[]>()
const memoryLimit = 200

export async function recordAiUsage(scope: UsageScope, event: UsageEvent): Promise<void> {
  if (scope.database) {
    await withTenant(scope.database, { tenantId: scope.organizationId, userId: scope.userId }, (tx) =>
      tx.query(
        `insert into ai_usage_events
          (organization_id, user_id, operation, model, status, error_code, input_chars, output_chars,
           prompt_tokens, completion_tokens, duration_ms)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          scope.organizationId,
          scope.userId,
          event.operation,
          event.model.slice(0, 120),
          event.status,
          event.errorCode,
          event.inputChars,
          event.outputChars,
          event.promptTokens,
          event.completionTokens,
          Math.max(0, Math.round(event.durationMs)),
        ],
      ),
    )
    return
  }
  const rows = memory.get(scope.organizationId) ?? []
  rows.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...event })
  memory.set(scope.organizationId, rows.slice(0, memoryLimit))
}

export async function listAiUsage(scope: UsageScope, limit = 50): Promise<AiUsageSummary> {
  if (scope.database) {
    return withTenant(scope.database, { tenantId: scope.organizationId, userId: scope.userId }, async (tx) => {
      const rows = await tx.query<{
        id: string
        operation: AiOperationId
        model: string
        status: AiUsageRow["status"]
        error_code: string | null
        input_chars: number
        output_chars: number
        prompt_tokens: number | null
        completion_tokens: number | null
        duration_ms: number
        created_at: Date | string
      }>(
        `select id, operation, model, status, error_code, input_chars, output_chars,
                prompt_tokens, completion_tokens, duration_ms, created_at
           from ai_usage_events
          where organization_id = $1
          order by created_at desc
          limit $2`,
        [scope.organizationId, limit],
      )
      const totals = await tx.query<{
        runs: number
        succeeded: number
        failed: number
        output_chars: number
        completion_tokens: number
      }>(
        `select count(*)::int as runs,
                count(*) filter (where status = 'succeeded')::int as succeeded,
                count(*) filter (where status = 'failed')::int as failed,
                coalesce(sum(output_chars), 0)::int as output_chars,
                coalesce(sum(completion_tokens), 0)::int as completion_tokens
           from ai_usage_events
          where organization_id = $1 and created_at > now() - interval '30 days'`,
        [scope.organizationId],
      )
      const total = totals.rows[0]
      return {
        storage: "database",
        rows: rows.rows.map((row) => ({
          id: row.id,
          operation: row.operation,
          model: row.model,
          status: row.status,
          errorCode: row.error_code,
          inputChars: row.input_chars,
          outputChars: row.output_chars,
          promptTokens: row.prompt_tokens,
          completionTokens: row.completion_tokens,
          durationMs: row.duration_ms,
          createdAt: new Date(row.created_at).toISOString(),
        })),
        totals: {
          runs: total?.runs ?? 0,
          succeeded: total?.succeeded ?? 0,
          failed: total?.failed ?? 0,
          outputChars: total?.output_chars ?? 0,
          completionTokens: total?.completion_tokens ?? 0,
        },
      }
    })
  }
  const rows = memory.get(scope.organizationId) ?? []
  return {
    storage: "memory",
    rows: rows.slice(0, limit),
    totals: {
      runs: rows.length,
      succeeded: rows.filter((row) => row.status === "succeeded").length,
      failed: rows.filter((row) => row.status === "failed").length,
      outputChars: rows.reduce((sum, row) => sum + row.outputChars, 0),
      completionTokens: rows.reduce((sum, row) => sum + (row.completionTokens ?? 0), 0),
    },
  }
}

export function clearMemoryUsage(): void {
  memory.clear()
}

/** Per-organization in-flight counter that protects a local model server from overload. */
const inFlight = new Map<string, number>()

export function acquireSlot(organizationId: string, max: number): (() => void) | null {
  const current = inFlight.get(organizationId) ?? 0
  if (current >= max) return null
  inFlight.set(organizationId, current + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const now = (inFlight.get(organizationId) ?? 1) - 1
    if (now <= 0) inFlight.delete(organizationId)
    else inFlight.set(organizationId, now)
  }
}
