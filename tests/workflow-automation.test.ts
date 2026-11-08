import { afterEach, describe, expect, test } from "vitest"
import { createLead } from "@/lib/crm/leads"
import { createOrganization } from "@/lib/org/store"
import { leadFollowUpDefinition, validateWorkflowDefinition } from "@/lib/workflows/definition"
import { dispatchLeadCreated } from "@/lib/workflows/dispatch"
import { WorkflowStepError } from "@/lib/workflows/run-graph"
import {
  createWorkflow,
  executionDetail,
  getWorkflowRecord,
  saveWorkflow,
  setWorkflowActive,
} from "@/lib/workflows/store"
import { signWebhook, verifyWebhookSignature } from "@/lib/workflows/webhook"
import {
  cancelWorkflowExecution,
  enqueueWorkflowExecution,
  processWorkflowJobs,
} from "@/lib/workflows/worker"
import { createMigratedDatabase } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function database() {
  const client = await createMigratedDatabase()
  clients.push(client)
  return client
}

async function organization(
  client: Awaited<ReturnType<typeof database>>,
  slug: string,
  ownerId: string,
) {
  const organizationId = await createOrganization(client, { name: slug, slug, userId: ownerId })
  await client.transaction(async (tx) => {
    await tx.query("select set_config('app.member_sync', '1', true)")
    await tx.query(
      "insert into organization_members (organization_id, user_id, role) values ($1::uuid, $2, 'editor'), ($1::uuid, $3, 'member')",
      [organizationId, `${slug}-editor`, `${slug}-member`],
    )
  })
  return organizationId
}

describe("workflow graphs", () => {
  test("rejects cycles, missing ends, and extra triggers", () => {
    const cycle = validateWorkflowDefinition({
      version: 1,
      nodes: [
        { id: "start", type: "manual", position: { x: 0, y: 0 }, config: {} },
        {
          id: "again",
          type: "text_transform",
          position: { x: 10, y: 10 },
          config: { template: "Hi" },
        },
      ],
      edges: [
        { id: "a", source: "start", target: "again", sourceHandle: "next" },
        { id: "b", source: "again", target: "start", sourceHandle: "next" },
      ],
    })
    expect(
      cycle.issues.some(
        (issue) => issue.message.includes("cycle") || issue.message.includes("end"),
      ),
    ).toBe(true)
    const two = validateWorkflowDefinition({
      version: 1,
      nodes: [
        { id: "start", type: "manual", position: { x: 0, y: 0 }, config: {} },
        { id: "other", type: "webhook", position: { x: 10, y: 10 }, config: {} },
        { id: "done", type: "end", position: { x: 20, y: 20 }, config: {} },
      ],
      edges: [{ id: "a", source: "start", target: "done", sourceHandle: "next" }],
    })
    expect(two.issues.some((issue) => issue.message.includes("exactly one trigger"))).toBe(true)
  })
})

describe("workflow execution", () => {
  test("runs a lead-created workflow through a condition into a follow-up task", async () => {
    const client = await database()
    const organizationId = await organization(client, "alpha", "owner-1")
    const otherId = await organization(client, "beta", "owner-2")
    const owner = { organizationId, userId: "owner-1" }
    const editor = { organizationId, userId: "alpha-editor" }
    const created = await createWorkflow(client, owner, "Lead follow-up")
    const saved = await saveWorkflow(client, editor, created.id, {
      definition: leadFollowUpDefinition(),
    })
    expect(saved.issues).toEqual([])
    await expect(setWorkflowActive(client, editor, created.id, true)).rejects.toMatchObject({
      code: "forbidden",
    })
    const active = await setWorkflowActive(client, owner, created.id, true)
    expect(active.status).toBe("active")
    expect(active.versionStatus).toBe("published")

    const lead = await createLead(
      client,
      { ...owner, role: "owner" },
      {
        name: "Ada",
        email: "ada@example.com",
        company: null,
        phone: null,
        source: "manual",
        ownerId: "owner-1",
      },
    )
    await processWorkflowJobs(client, "worker-1", { limit: 5 })
    const tasks = await client.query<{ title: string }>("select title from follow_up_tasks")
    expect(tasks.rows.map((row) => row.title)).toEqual(["Follow up with Ada"])
    const runs = await client.query<{ id: string; status: string }>(
      "select id, status from workflow_executions where workflow_id = $1::uuid",
      [created.id],
    )
    expect(runs.rows).toHaveLength(1)
    expect(runs.rows[0]?.status).toBe("succeeded")
    const detail = await executionDetail(client, owner, runs.rows[0]?.id ?? "")
    expect(detail.steps.map((step) => step.status)).toContain("succeeded")

    await dispatchLeadCreated(client, organizationId, {
      id: lead.id,
      email: lead.email,
      name: lead.name,
      source: lead.source,
    })
    const again = await client.query(
      "select id from workflow_executions where workflow_id = $1::uuid",
      [created.id],
    )
    expect(again.rows).toHaveLength(1)

    await expect(
      getWorkflowRecord(client, { organizationId: otherId, userId: "owner-2" }, created.id),
    ).rejects.toMatchObject({
      code: "not_found",
    })
    await expect(
      executionDetail(
        client,
        { organizationId: otherId, userId: "owner-2" },
        runs.rows[0]?.id ?? "",
      ),
    ).rejects.toMatchObject({
      code: "not_found",
    })
  })

  test("retries retryable failures, stops permanent failures, recovers abandoned jobs, and isolates claims", async () => {
    const client = await database()
    const organizationId = await organization(client, "retry", "owner-1")
    const owner = { organizationId, userId: "owner-1" }
    const workflow = await createWorkflow(client, owner, "Retry")
    await saveWorkflow(client, owner, workflow.id, {
      definition: {
        version: 1,
        nodes: [
          { id: "start", type: "manual", position: { x: 0, y: 0 }, config: {} },
          {
            id: "task",
            type: "follow_up",
            position: { x: 100, y: 0 },
            config: { title: "Call", body: "Now" },
          },
          { id: "done", type: "end", position: { x: 200, y: 0 }, config: {} },
        ],
        edges: [
          { id: "a", source: "start", target: "task", sourceHandle: "next" },
          { id: "b", source: "task", target: "done", sourceHandle: "next" },
        ],
      },
    })
    const current = await getWorkflowRecord(client, owner, workflow.id)
    let attempts = 0
    const flaky = {
      async createFollowUp() {
        attempts += 1
        if (attempts === 1) throw new WorkflowStepError("temporary outage", true)
        return { taskId: "task-1" }
      },
      async sendEmail() {
        return { providerId: "unused" }
      },
      async generateText() {
        return { text: "unused" }
      },
    }
    const executionId = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: null,
      test: true,
    })
    await processWorkflowJobs(client, "worker-a", { limit: 1, executionId, effects: flaky })
    const waiting = await client.query<{ status: string }>(
      "select status from jobs where payload->>'executionId' = $1",
      [executionId],
    )
    expect(waiting.rows[0]?.status).toBe("failed")
    await client.query("update jobs set run_after = now() where payload->>'executionId' = $1", [
      executionId,
    ])
    await processWorkflowJobs(client, "worker-b", { limit: 1, executionId, effects: flaky })
    const finished = await executionDetail(client, owner, executionId)
    expect(finished.status).toBe("succeeded")
    expect(attempts).toBe(2)

    const permanentId = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: null,
      test: true,
    })
    await processWorkflowJobs(client, "worker-c", {
      limit: 1,
      executionId: permanentId,
      effects: {
        ...flaky,
        async createFollowUp() {
          throw new WorkflowStepError("bad data", false)
        },
      },
    })
    const dead = await client.query<{ status: string }>(
      "select status from jobs where payload->>'executionId' = $1",
      [permanentId],
    )
    expect(dead.rows[0]?.status).toBe("dead")

    const stuckId = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: "stuck-1",
      test: true,
    })
    const secondId = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: "stuck-2",
      test: true,
    })
    const firstClaim = await client.query<{ job_id: string }>(
      "select * from app_claim_workflow_job('worker-d', null)",
    )
    const secondClaim = await client.query<{ job_id: string }>(
      "select * from app_claim_workflow_job('worker-e', null)",
    )
    expect(firstClaim.rows[0]?.job_id).toBeTruthy()
    expect(secondClaim.rows[0]?.job_id).toBeTruthy()
    expect(firstClaim.rows[0]?.job_id).not.toBe(secondClaim.rows[0]?.job_id)
    await client.query(
      "update jobs set locked_at = now() - interval '5 minutes' where id = $1::uuid",
      [firstClaim.rows[0]?.job_id],
    )
    const recovered = await client.query<{ recovered: number }>(
      "select app_recover_workflow_jobs(60) as recovered",
    )
    expect(recovered.rows[0]?.recovered).toBe(1)
    const recoveredJob = await client.query<{ status: string }>(
      "select status from jobs where id = $1::uuid",
      [firstClaim.rows[0]?.job_id],
    )
    expect(recoveredJob.rows[0]?.status).toBe("failed")

    const queued = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: "cancel-me",
      test: true,
    })
    expect(await cancelWorkflowExecution(client, owner, queued)).toBe("cancelled")
    await processWorkflowJobs(client, "worker-f", { limit: 3, executionId: queued, effects: flaky })
    expect((await executionDetail(client, owner, queued)).status).toBe("cancelled")

    await client.query("update workflow_runtime set enabled = false")
    const paused = await enqueueWorkflowExecution(client, {
      organizationId,
      workflowId: current.id,
      versionId: current.versionId,
      trigger: "test",
      payload: {},
      idempotencyKey: "paused",
      test: true,
    })
    const claimedPaused = await client.query(
      "select * from app_claim_workflow_job('worker-g', $1::uuid)",
      [paused],
    )
    expect(claimedPaused.rows).toHaveLength(0)
    const stillThere = await client.query<{ status: string }>(
      "select status from jobs where payload->>'executionId' = $1",
      [paused],
    )
    expect(stillThere.rows[0]?.status).toBe("pending")

    await expect(
      enqueueWorkflowExecution(client, {
        organizationId,
        workflowId: current.id,
        versionId: current.versionId,
        trigger: "test",
        payload: {},
        idempotencyKey: null,
        test: true,
      }),
    ).resolves.toBeTruthy()
    await client.query(
      `insert into workflow_executions (organization_id, workflow_id, version_id, status)
       select $1::uuid, $2::uuid, $3::uuid, 'succeeded' from generate_series(1, 100)`,
      [organizationId, current.id, current.versionId],
    )
    await expect(
      enqueueWorkflowExecution(client, {
        organizationId,
        workflowId: current.id,
        versionId: current.versionId,
        trigger: "test",
        payload: {},
        idempotencyKey: null,
        test: true,
      }),
    ).rejects.toMatchObject({ code: "workflow_quota" })
    void stuckId
    void secondId
  })
})

describe("webhook signatures", () => {
  test("accepts a fresh signature once and rejects replays and stale timestamps", async () => {
    const secret = "a".repeat(40)
    const body = JSON.stringify({ hello: "cognera" })
    const timestamp = "1700000000"
    const signature = signWebhook(secret, timestamp, body)
    const header = `t=${timestamp},v1=${signature}`
    expect(verifyWebhookSignature(secret, header, body, 1_700_000_000_000).ok).toBe(true)
    expect(
      verifyWebhookSignature(secret, header, body, 1_700_000_000_000 + 10 * 60 * 1000).ok,
    ).toBe(false)
    expect(
      verifyWebhookSignature(
        "other-secret-value-with-enough-length",
        header,
        body,
        1_700_000_000_000,
      ).ok,
    ).toBe(false)

    const client = await database()
    const organizationId = await organization(client, "hook", "owner-1")
    const workflow = await createWorkflow(client, { organizationId, userId: "owner-1" }, "Hook")
    await client.query(
      `insert into workflow_webhook_secrets (organization_id, workflow_id, secret, status)
       values ($1::uuid, $2::uuid, $3, 'active')`,
      [organizationId, workflow.id, secret],
    )
    const first = await client.query<{ recorded: boolean }>(
      "select app_record_webhook_nonce($1::uuid, $2) as recorded",
      [workflow.id, signature],
    )
    const second = await client.query<{ recorded: boolean }>(
      "select app_record_webhook_nonce($1::uuid, $2) as recorded",
      [workflow.id, signature],
    )
    expect(first.rows[0]?.recorded).toBe(true)
    expect(second.rows[0]?.recorded).toBe(false)
  })
})
