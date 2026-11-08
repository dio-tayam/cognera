import { AppError } from "@/lib/errors"
import type { SqlClient } from "@/lib/db/types"
import { logEvent } from "@/lib/log/logger"
import { triggerOf, validateWorkflowDefinition } from "@/lib/workflows/definition"
import { enqueueWorkflowExecution } from "@/lib/workflows/worker"

export type LeadEvent = { id: string; email: string; name: string; source: string }

/**
 * Queues active lead-created workflows inside the caller's transaction, so the
 * execution is committed with the lead or not at all (a transactional outbox).
 * Each workflow runs in a savepoint: a quota or inactive-workflow rejection is
 * logged and skipped, and does not roll back the lead itself.
 * The idempotency key makes a repeated event for the same lead a no-op.
 */
export async function dispatchLeadCreated(
  client: SqlClient,
  organizationId: string,
  lead: LeadEvent,
): Promise<{ queued: string[]; skipped: Array<{ workflowId: string; reason: string }> }> {
  const rows = await client.query<{ workflow_id: string; version_id: string; definition: unknown }>(
    `select w.id as workflow_id, v.id as version_id, v.definition
     from workflows w
     join workflow_versions v on v.workflow_id = w.id and v.status = 'published'
     where w.organization_id = $1::uuid
       and w.status = 'active'
       and v.definition->'nodes' @> '[{"type": "lead_created"}]'::jsonb`,
    [organizationId],
  )
  const queued: string[] = []
  const skipped: Array<{ workflowId: string; reason: string }> = []
  for (const row of rows.rows) {
    const checked = validateWorkflowDefinition(row.definition)
    const trigger = checked.definition ? triggerOf(checked.definition) : undefined
    if (!trigger || trigger.type !== "lead_created") continue
    if (trigger.config.source && trigger.config.source !== lead.source) continue
    const savepoint = await openSavepoint(client)
    try {
      const id = await enqueueWorkflowExecution(client, {
        organizationId,
        workflowId: row.workflow_id,
        versionId: row.version_id,
        trigger: "lead_created",
        payload: { lead },
        idempotencyKey: `lead:${lead.id}:workflow:${row.workflow_id}`,
        test: false,
      })
      if (savepoint) await client.query("release savepoint workflow_dispatch")
      queued.push(id)
    } catch (error) {
      if (savepoint) await client.query("rollback to savepoint workflow_dispatch")
      const reason = error instanceof AppError ? error.code : "error"
      skipped.push({ workflowId: row.workflow_id, reason })
      logEvent("warn", "workflow.trigger_skipped", {
        workflowId: row.workflow_id,
        trigger: "lead_created",
        reason,
      })
    }
  }
  return { queued, skipped }
}

/** Outside a transaction each statement commits alone, so no savepoint is needed. */
async function openSavepoint(client: SqlClient): Promise<boolean> {
  try {
    await client.query("savepoint workflow_dispatch")
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("can only be used in transaction blocks")
    ) {
      return false
    }
    throw error
  }
}

/** Advances due schedules and queues their executions atomically in the database. */
export async function dispatchDueSchedules(client: SqlClient, limit = 25): Promise<number> {
  const rows = await client.query<{ queued: number }>(
    "select app_dispatch_due_workflow_schedules($1) as queued",
    [limit],
  )
  return Number(rows.rows[0]?.queued ?? 0)
}
