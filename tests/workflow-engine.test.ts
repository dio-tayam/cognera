import { afterEach, describe, expect, test, vi } from "vitest"
import { createLead } from "@/lib/crm/leads"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import { createOrganization } from "@/lib/org/store"
import {
  leadFollowUpDefinition,
  readinessIssues,
  validateWorkflowDefinition,
  type WorkflowDefinition,
} from "@/lib/workflows/definition"
import { dispatchDueSchedules, dispatchLeadCreated } from "@/lib/workflows/dispatch"
import { backoffSeconds } from "@/lib/workflows/limits"
import {
  runWorkflowGraph,
  WorkflowStepError,
  type WorkflowEffects,
} from "@/lib/workflows/run-graph"
import {
  createWorkflow,
  executionDetail,
  getWorkflowOverview,
  listExecutions,
  rotateWebhookSecret,
  revokeWebhookSecret,
  saveWorkflow,
  setWorkflowActive,
  startWorkflowRun,
} from "@/lib/workflows/store"
import { acceptWebhook, signWebhook } from "@/lib/workflows/webhook"
import {
  cancelWorkflowExecution,
  enqueueWorkflowExecution,
  processWorkflowJobs,
  retryWorkflowExecution,
} from "@/lib/workflows/worker"
import { createMigratedDatabase } from "./helpers/database"

const clients: SqlClient[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function database() {
  const client = await createMigratedDatabase()
  clients.push(client)
  return client
}

type Org = {
  id: string
  owner: { organizationId: string; userId: string; role: string }
  editor: { organizationId: string; userId: string; role: string }
  member: { organizationId: string; userId: string; role: string }
}

async function organization(client: SqlClient, slug: string): Promise<Org> {
  const ownerId = `${slug}-owner`
  const id = await createOrganization(client, { name: slug, slug, userId: ownerId })
  await client.transaction(async (tx) => {
    await tx.query("select set_config('app.member_sync', '1', true)")
    await tx.query(
      "insert into organization_members (organization_id, user_id, role) values ($1::uuid, $2, 'editor'), ($1::uuid, $3, 'member')",
      [id, `${slug}-editor`, `${slug}-member`],
    )
  })
  return {
    id,
    owner: { organizationId: id, userId: ownerId, role: "owner" },
    editor: { organizationId: id, userId: `${slug}-editor`, role: "editor" },
    member: { organizationId: id, userId: `${slug}-member`, role: "member" },
  }
}

function linear(
  trigger: WorkflowDefinition["nodes"][number],
  ...actions: WorkflowDefinition["nodes"]
): WorkflowDefinition {
  const nodes = [
    trigger,
    ...actions,
    { id: "done", type: "end" as const, position: { x: 900, y: 0 }, config: {} },
  ]
  return {
    version: 1,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `e${index}`,
      source: node.id,
      target: nodes[index + 1]?.id ?? "done",
      sourceHandle: "next" as const,
    })),
  }
}

const at = (x: number) => ({ x, y: 0 })
const manual = { id: "start", type: "manual" as const, position: at(0), config: {} }
const followUp = {
  id: "task",
  type: "follow_up" as const,
  position: at(200),
  config: { title: "Call {{input.lead.name}}", body: "" },
}
const email = {
  id: "mail",
  type: "send_email" as const,
  position: at(400),
  config: { toPath: "input.lead.email", subject: "Hi", body: "Hello" },
}

/** Counting effects. Follow-ups go through the real database function by default. */
function effects(overrides: Partial<WorkflowEffects> = {}) {
  const calls = { followUp: 0, email: 0, text: 0 }
  const value: WorkflowEffects = {
    async createFollowUp(input, context) {
      calls.followUp += 1
      if (overrides.createFollowUp) return overrides.createFollowUp(input, context)
      return { taskId: `task-${calls.followUp}` }
    },
    async sendEmail(input, context) {
      calls.email += 1
      if (overrides.sendEmail) return overrides.sendEmail(input, context)
      return { providerId: context.idempotencyKey }
    },
    async generateText(prompt, context) {
      calls.text += 1
      if (overrides.generateText) return overrides.generateText(prompt, context)
      return { text: "generated" }
    },
  }
  return { calls, value }
}

async function activeWorkflow(
  client: SqlClient,
  org: Org,
  definition: WorkflowDefinition,
  name = "Flow",
) {
  const created = await createWorkflow(client, org.owner, name)
  const saved = await saveWorkflow(client, org.owner, created.id, { definition })
  expect(saved.issues).toEqual([])
  return setWorkflowActive(client, org.owner, created.id, true)
}

async function testRun(client: SqlClient, org: Org, workflowId: string) {
  return startWorkflowRun(client, org.owner, workflowId, "test")
}

async function jobFor(client: SqlClient, executionId: string) {
  const rows = await client.query<{
    id: string
    status: string
    attempts: number
    run_after: Date
    locked_by: string | null
  }>(
    "select id, status, attempts, run_after, locked_by from jobs where payload->>'executionId' = $1",
    [executionId],
  )
  return rows.rows[0]
}

async function makeDue(client: SqlClient, executionId: string) {
  await client.query("update jobs set run_after = now() where payload->>'executionId' = $1", [
    executionId,
  ])
}

const lead = (name: string, source = "manual") => ({
  name,
  email: `${name.toLowerCase()}@example.com`,
  company: null,
  phone: null,
  source: source as "manual",
  ownerId: null,
})

describe("workflow validation", () => {
  test("maps schema errors to the node that caused them", () => {
    const definition = leadFollowUpDefinition()
    const broken = {
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === "task" ? { ...node, config: { title: "   ", body: "" } } : node,
      ),
    }
    const result = validateWorkflowDefinition(broken)
    expect(result.definition).toBeNull()
    expect(result.issues).toContainEqual({ nodeId: "task", message: "Title: Enter a task title." })
  })

  test("rejects invalid graphs with node-level messages", () => {
    const base = leadFollowUpDefinition()
    const intoTrigger = validateWorkflowDefinition({
      ...base,
      edges: [...base.edges, { id: "back", source: "task", target: "start", sourceHandle: "next" }],
    })
    expect(intoTrigger.issues.map((issue) => issue.message)).toContain(
      "A trigger cannot have incoming connections.",
    )

    const twoYes = validateWorkflowDefinition({
      ...base,
      edges: [...base.edges, { id: "yes2", source: "check", target: "done", sourceHandle: "true" }],
    })
    expect(twoYes.issues).toContainEqual({
      nodeId: "check",
      message: "A condition needs exactly one yes path and one no path.",
    })

    const badPlaceholder = validateWorkflowDefinition({
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === "task"
          ? { ...node, config: { title: "Hi {{process.env.SECRET}}", body: "" } }
          : node,
      ),
    })
    expect(
      badPlaceholder.issues.some(
        (issue) => issue.nodeId === "task" && issue.message.includes("placeholder"),
      ),
    ).toBe(true)

    const orphanCycle = validateWorkflowDefinition({
      ...base,
      nodes: [
        ...base.nodes,
        { id: "a", type: "text_transform", position: at(0), config: { template: "a" } },
        { id: "b", type: "text_transform", position: at(0), config: { template: "b" } },
      ],
      edges: [
        ...base.edges,
        { id: "ab", source: "a", target: "b", sourceHandle: "next" },
        { id: "ba", source: "b", target: "a", sourceHandle: "next" },
      ],
    })
    const messages = orphanCycle.issues.map((issue) => issue.message)
    expect(messages).toContain("The workflow cannot contain a cycle.")
    expect(messages).toContain("This node is not reachable from the trigger.")

    const noTrigger = validateWorkflowDefinition({ version: 1, nodes: [], edges: [] })
    expect(noTrigger.issues.map((issue) => issue.message)).toEqual([
      "Add one trigger.",
      "Add an end node.",
    ])

    expect(validateWorkflowDefinition({ version: 2, nodes: [], edges: [] }).definition).toBeNull()
    expect(validateWorkflowDefinition("<script>").definition).toBeNull()
  })

  test("flags nodes that need operator configuration and blocks activation", async () => {
    const definition = linear(manual, email)
    expect(readinessIssues(definition, { email: false, ai: true })).toEqual([
      {
        nodeId: "mail",
        message: "Email is not configured. Set EMAIL_WEBHOOK_URL before activating.",
      },
    ])
    const client = await database()
    const org = await organization(client, "ready")
    const created = await createWorkflow(client, org.owner, "Mail")
    await saveWorkflow(client, org.owner, created.id, { definition })
    await expect(
      setWorkflowActive(client, org.owner, created.id, true, { email: false, ai: false }),
    ).rejects.toMatchObject({ code: "integration_required" })
  })

  test("save rejects a stale base version instead of overwriting", async () => {
    const client = await database()
    const org = await organization(client, "stale")
    const created = await createWorkflow(client, org.owner, "Flow")
    await saveWorkflow(client, org.editor, created.id, {
      definition: linear(manual, followUp),
      baseVersionNumber: 1,
    })
    await expect(
      saveWorkflow(client, org.owner, created.id, {
        definition: leadFollowUpDefinition(),
        baseVersionNumber: 1,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" })
  })
})

describe("lead-created workflow, end to end", () => {
  test("lead → condition → follow-up task → persisted execution with step log", async () => {
    const client = await database()
    const org = await organization(client, "acme")
    const workflow = await activeWorkflow(client, org, leadFollowUpDefinition(), "Lead follow-up")

    const saved = await createLead(client, { ...org.owner, role: "owner" }, lead("Ada"))
    const queued = await listExecutions(client, org.owner, { workflowId: workflow.id })
    expect(queued).toHaveLength(1)
    expect(queued[0]?.status).toBe("queued")

    expect(await processWorkflowJobs(client, "worker-1")).toBe(1)

    const [run] = await listExecutions(client, org.owner, { workflowId: workflow.id })
    const detail = await executionDetail(client, org.owner, run?.id ?? "")
    expect(detail.status).toBe("succeeded")
    expect(detail.triggerType).toBe("lead_created")
    expect(detail.versionNumber).toBe(workflow.versionNumber)
    expect(detail.steps.map((step) => [step.nodeId, step.status])).toEqual([
      ["start", "succeeded"],
      ["check", "succeeded"],
      ["task", "succeeded"],
      ["done", "succeeded"],
    ])
    expect(detail.steps[1]?.output).toEqual({ pass: true })
    expect(detail.tasks).toHaveLength(1)
    expect(detail.tasks[0]).toMatchObject({ title: "Follow up with Ada", leadId: saved.id })
    expect(detail.job).toMatchObject({ status: "succeeded", attempts: 1 })
    expect(detail.canRetry).toBe(false)
  })

  test("the condition's no path skips the task", async () => {
    const client = await database()
    const org = await organization(client, "nopath")
    const definition = leadFollowUpDefinition()
    definition.nodes = definition.nodes.map((node) =>
      node.id === "check" && node.type === "condition"
        ? { ...node, config: { path: "input.lead.source", operator: "equals", value: "referral" } }
        : node,
    )
    await activeWorkflow(client, org, definition)
    await createLead(client, { ...org.owner, role: "owner" }, lead("Bo"))
    await processWorkflowJobs(client, "worker-1")
    const tasks = await withTenant(client, { tenantId: org.id, userId: org.owner.userId }, (tx) =>
      tx.query("select id from follow_up_tasks"),
    )
    expect(tasks.rows).toHaveLength(0)
    const [run] = await listExecutions(client, org.owner)
    const detail = await executionDetail(client, org.owner, run?.id ?? "")
    expect(detail.steps.map((step) => step.nodeId)).toEqual(["start", "check", "skip"])
  })
})

describe("trigger matching", () => {
  test("only active lead workflows whose source filter matches are started", async () => {
    const client = await database()
    const org = await organization(client, "match")
    const referral = leadFollowUpDefinition()
    referral.nodes = referral.nodes.map((node) =>
      node.type === "lead_created" ? { ...node, config: { source: "referral" } } : node,
    )
    const referralFlow = await activeWorkflow(client, org, referral, "Referral only")
    const anyFlow = await activeWorkflow(client, org, leadFollowUpDefinition(), "Any lead")
    await activeWorkflow(client, org, linear(manual, followUp), "Manual flow")
    const draft = await createWorkflow(client, org.owner, "Draft")
    await saveWorkflow(client, org.owner, draft.id, { definition: leadFollowUpDefinition() })

    await createLead(client, { ...org.owner, role: "owner" }, lead("Cy", "manual"))
    let runs = await listExecutions(client, org.owner)
    expect(runs.map((run) => run.workflowId)).toEqual([anyFlow.id])

    await createLead(client, { ...org.owner, role: "owner" }, lead("Di", "referral"))
    runs = await listExecutions(client, org.owner)
    expect(runs.map((run) => run.workflowId).sort()).toEqual(
      [anyFlow.id, anyFlow.id, referralFlow.id].sort(),
    )
  })

  test("an event cannot start a workflow with a different trigger", async () => {
    const client = await database()
    const org = await organization(client, "mismatch")
    const flow = await activeWorkflow(client, org, leadFollowUpDefinition())
    await expect(
      enqueueWorkflowExecution(client, {
        organizationId: org.id,
        workflowId: flow.id,
        versionId: flow.versionId,
        trigger: "webhook",
        payload: {},
        idempotencyKey: null,
        test: false,
      }),
    ).rejects.toMatchObject({ code: "trigger_mismatch" })
    await expect(rotateWebhookSecret(client, org.owner, flow.id)).rejects.toMatchObject({
      code: "trigger_mismatch",
    })
    // Even a secret inserted directly does not open a webhook on a lead workflow.
    await client.query(
      `insert into workflow_webhook_secrets (organization_id, workflow_id, secret, status) values ($1::uuid, $2::uuid, $3, 'active')`,
      [org.id, flow.id, "s".repeat(40)],
    )
    const body = "{}"
    const t = String(Math.floor(Date.now() / 1000))
    const outcome = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: `t=${t},v1=${signWebhook("s".repeat(40), t, body)}`,
      idempotencyKey: null,
      body,
    })
    expect(outcome).toMatchObject({ ok: false, status: 404 })
  })

  test("schedules queue one execution per slot, even when dispatched twice", async () => {
    const client = await database()
    const org = await organization(client, "sched")
    const flow = await activeWorkflow(
      client,
      org,
      linear(
        { id: "start", type: "schedule", position: at(0), config: { intervalMinutes: 15 } },
        followUp,
      ),
    )
    await client.query(
      "update scheduled_jobs set next_run_at = now() - interval '1 minute' where workflow_id = $1::uuid",
      [flow.id],
    )
    expect(await dispatchDueSchedules(client)).toBe(1)
    expect(await dispatchDueSchedules(client)).toBe(0)
    const runs = await listExecutions(client, org.owner, { workflowId: flow.id })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.triggerType).toBe("schedule")
    const next = await client.query<{ next_run_at: Date }>(
      "select next_run_at from scheduled_jobs where workflow_id = $1::uuid and status = 'active'",
      [flow.id],
    )
    expect(new Date(next.rows[0]?.next_run_at ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 14 * 60 * 1000,
    )

    await setWorkflowActive(client, org.owner, flow.id, false)
    await client.query(
      "update scheduled_jobs set next_run_at = now() - interval '1 minute' where workflow_id = $1::uuid",
      [flow.id],
    )
    expect(await dispatchDueSchedules(client)).toBe(0)
  })
})

describe("webhook intake", () => {
  async function webhookFlow(client: SqlClient, org: Org) {
    const flow = await activeWorkflow(
      client,
      org,
      linear(
        { id: "start", type: "webhook", position: at(0), config: {} },
        {
          id: "shape",
          type: "text_transform",
          position: at(200),
          config: { template: "Order {{input.webhook.order}}" },
        },
      ),
    )
    const secret = await rotateWebhookSecret(client, org.owner, flow.id)
    return { flow, secret }
  }

  function signed(secret: string, body: string, now = Date.now()) {
    const t = String(Math.floor(now / 1000))
    return `t=${t},v1=${signWebhook(secret, t, body)}`
  }

  test("accepts a signed body once, then rejects replays, bad signatures, and bad payloads", async () => {
    const client = await database()
    const org = await organization(client, "hook")
    const { flow, secret } = await webhookFlow(client, org)
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    const body = JSON.stringify({ order: 42 })
    const signature = signed(secret, body)

    const first = await acceptWebhook(client, {
      workflowId: flow.id,
      signature,
      idempotencyKey: null,
      body,
    })
    expect(first.ok).toBe(true)
    const replay = await acceptWebhook(client, {
      workflowId: flow.id,
      signature,
      idempotencyKey: null,
      body,
    })
    expect(replay).toMatchObject({ ok: false, status: 409, code: "replayed" })

    const tampered = await acceptWebhook(client, {
      workflowId: flow.id,
      signature,
      idempotencyKey: null,
      body: '{"order":43}',
    })
    expect(tampered).toMatchObject({ ok: false, status: 401 })
    const stale = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, body, Date.now() - 10 * 60 * 1000),
      idempotencyKey: null,
      body,
    })
    expect(stale).toMatchObject({ ok: false, status: 401 })
    const notJson = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, "nope"),
      idempotencyKey: null,
      body: "nope",
    })
    expect(notJson).toMatchObject({ ok: false, status: 400 })
    const array = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, "[1]"),
      idempotencyKey: null,
      body: "[1]",
    })
    expect(array).toMatchObject({ ok: false, status: 400 })
    const big = JSON.stringify({ blob: "x".repeat(40_000) })
    const tooLarge = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, big),
      idempotencyKey: null,
      body: big,
    })
    expect(tooLarge).toMatchObject({ ok: false, status: 413 })

    await processWorkflowJobs(client, "worker-1")
    if (!first.ok) throw new Error("expected acceptance")
    const detail = await executionDetail(client, org.owner, first.executionId)
    expect(detail.status).toBe("succeeded")
    expect(detail.steps.find((step) => step.nodeId === "shape")?.output).toEqual({
      text: "Order 42",
    })
  })

  test("a sender's idempotency key collapses redeliveries into one execution", async () => {
    const client = await database()
    const org = await organization(client, "hookkey")
    const { flow, secret } = await webhookFlow(client, org)
    const body = JSON.stringify({ order: 7 })
    const one = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, body),
      idempotencyKey: "evt_1",
      body,
    })
    const two = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, body, Date.now() + 1000),
      idempotencyKey: "evt_1",
      body,
    })
    expect(one.ok && two.ok && one.executionId === two.executionId).toBe(true)
    expect(await listExecutions(client, org.owner, { workflowId: flow.id })).toHaveLength(1)
  })

  test("rotation invalidates the old secret and revocation closes the endpoint", async () => {
    const client = await database()
    const org = await organization(client, "hookrot")
    const { flow, secret } = await webhookFlow(client, org)
    const rotated = await rotateWebhookSecret(client, org.owner, flow.id)
    expect(rotated).not.toBe(secret)
    const body = "{}"
    const old = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(secret, body),
      idempotencyKey: null,
      body,
    })
    expect(old).toMatchObject({ ok: false, status: 401 })
    expect(await revokeWebhookSecret(client, org.owner, flow.id)).toBe(true)
    const closed = await acceptWebhook(client, {
      workflowId: flow.id,
      signature: signed(rotated, body),
      idempotencyKey: null,
      body,
    })
    expect(closed).toMatchObject({ ok: false, status: 404 })
    await expect(rotateWebhookSecret(client, org.editor, flow.id)).rejects.toMatchObject({
      code: "forbidden",
    })
    const editorView = await getWorkflowOverview(client, org.editor, flow.id)
    expect(editorView.webhook).toEqual({ visible: false, activeSince: null })
  })
})

describe("authorization", () => {
  test("members read, editors build and run, owners and admins activate", async () => {
    const client = await database()
    const org = await organization(client, "roles")
    const flow = await createWorkflow(client, org.editor, "Editor draft")
    await expect(createWorkflow(client, org.member, "Nope")).rejects.toMatchObject({
      code: "forbidden",
    })
    await expect(
      saveWorkflow(client, org.member, flow.id, { definition: leadFollowUpDefinition() }),
    ).rejects.toMatchObject({ code: "forbidden" })
    await expect(startWorkflowRun(client, org.member, flow.id, "test")).rejects.toMatchObject({
      code: "forbidden",
    })
    await expect(setWorkflowActive(client, org.editor, flow.id, true)).rejects.toMatchObject({
      code: "forbidden",
    })

    const executionId = await startWorkflowRun(client, org.editor, flow.id, "test")
    await expect(cancelWorkflowExecution(client, org.member, executionId)).rejects.toMatchObject({
      code: "forbidden",
    })
    expect((await executionDetail(client, org.member, executionId)).canCancel).toBe(false)
    expect(await cancelWorkflowExecution(client, org.editor, executionId)).toBe("cancelled")
  })

  test("editors cannot publish or write execution history through direct SQL", async () => {
    const client = await database()
    const org = await organization(client, "direct")
    const flow = await createWorkflow(client, org.editor, "Draft")
    const scope = { tenantId: org.id, userId: org.editor.userId }
    await expect(
      withTenant(client, scope, (tx) =>
        tx.query("update workflow_versions set status = 'published' where workflow_id = $1::uuid", [
          flow.id,
        ]),
      ),
    ).rejects.toThrow(/owner or admin/)
    await expect(
      withTenant(client, scope, (tx) =>
        tx.query("update workflows set status = 'active' where id = $1::uuid", [flow.id]),
      ),
    ).rejects.toThrow(/owner or admin/)
    await expect(
      withTenant(client, scope, (tx) =>
        tx.query(
          "insert into workflow_executions (organization_id, workflow_id, version_id, status) values ($1::uuid, $2::uuid, $3::uuid, 'succeeded')",
          [org.id, flow.id, flow.versionId],
        ),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      withTenant(client, { tenantId: org.id, userId: org.owner.userId }, (tx) =>
        tx.query("delete from workflow_versions where workflow_id = $1::uuid", [flow.id]),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})

describe("immutable versions and explicit states", () => {
  test("published definitions cannot change and illegal transitions are rejected", async () => {
    const client = await database()
    const org = await organization(client, "immutable")
    const flow = await activeWorkflow(client, org, linear(manual, followUp))
    await expect(
      client.query("update workflow_versions set definition = '{}'::jsonb where id = $1::uuid", [
        flow.versionId,
      ]),
    ).rejects.toThrow(/immutable/)

    const edited = await saveWorkflow(client, org.owner, flow.id, {
      definition: linear(manual, followUp, email),
    })
    expect(edited.workflow.versionNumber).toBe(flow.versionNumber + 1)
    expect(edited.workflow.versionStatus).toBe("draft")
    expect(edited.workflow.publishedVersionNumber).toBe(flow.versionNumber)

    const executionId = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "worker-1", { effects: effects().value })
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("succeeded")
    await expect(
      client.query("update workflow_executions set status = 'running' where id = $1::uuid", [
        executionId,
      ]),
    ).rejects.toThrow(/cannot move from succeeded to running/)
  })
})

describe("duplicate events", () => {
  test("a repeated lead event and concurrent identical enqueues produce one execution", async () => {
    const client = await database()
    const org = await organization(client, "dupes")
    const flow = await activeWorkflow(client, org, leadFollowUpDefinition())
    const saved = await createLead(client, { ...org.owner, role: "owner" }, lead("Eve"))
    const event = { id: saved.id, email: saved.email, name: saved.name, source: saved.source }
    await dispatchLeadCreated(client, org.id, event)
    await client.transaction((tx) => dispatchLeadCreated(tx, org.id, event))
    expect(await listExecutions(client, org.owner, { workflowId: flow.id })).toHaveLength(1)

    const ids = await Promise.all(
      Array.from({ length: 5 }, () =>
        enqueueWorkflowExecution(client, {
          organizationId: org.id,
          workflowId: flow.id,
          versionId: flow.versionId,
          trigger: "lead_created",
          payload: {},
          idempotencyKey: "same-event",
          test: false,
        }),
      ),
    )
    expect(new Set(ids).size).toBe(1)
    const jobs = await client.query("select id from jobs where idempotency_key = 'same-event'")
    expect(jobs.rows).toHaveLength(1)
  })
})

describe("retries and dead letters", () => {
  test("retryable failures back off and stop at the attempt limit, then dead-letter", async () => {
    const client = await database()
    const org = await organization(client, "retry")
    const flow = await activeWorkflow(client, org, linear(manual, email))
    const failing = effects({
      async sendEmail() {
        throw new WorkflowStepError("provider down", true)
      },
    })
    const executionId = await testRun(client, org, flow.id)
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await makeDue(client, executionId)
      expect(
        await processWorkflowJobs(client, `w${attempt}`, { executionId, effects: failing.value }),
      ).toBe(1)
      const detail = await executionDetail(client, org.owner, executionId)
      if (attempt < 5) {
        expect(detail.status).toBe("retry_scheduled")
        expect(detail.nextRetryAt).not.toBeNull()
        expect((await jobFor(client, executionId))?.status).toBe("failed")
      }
    }
    await makeDue(client, executionId)
    expect(await processWorkflowJobs(client, "w6", { executionId, effects: failing.value })).toBe(0)
    const dead = await executionDetail(client, org.owner, executionId)
    expect(dead.status).toBe("failed")
    expect(dead.deadLettered).toBe(true)
    expect(dead.attemptCount).toBe(5)
    expect(dead.job).toMatchObject({ status: "dead", attempts: 5, maxAttempts: 5 })
    expect(failing.calls.email).toBe(5)
    expect(dead.steps.filter((step) => step.nodeId === "mail").map((step) => step.attempt)).toEqual(
      [1, 2, 3, 4, 5],
    )
    expect(dead.canRetry).toBe(true)
  })

  test("permanent failures dead-letter on the first attempt", async () => {
    const client = await database()
    const org = await organization(client, "permanent")
    const flow = await activeWorkflow(client, org, linear(manual, email))
    const failing = effects({
      async sendEmail() {
        throw new WorkflowStepError("recipient rejected", false)
      },
    })
    const executionId = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "w1", { executionId, effects: failing.value })
    const detail = await executionDetail(client, org.owner, executionId)
    expect(detail.status).toBe("failed")
    expect(detail.error).toBe("recipient rejected")
    expect(detail.job?.status).toBe("dead")
    expect(failing.calls.email).toBe(1)
  })

  test("backoff is exponential and bounded", () => {
    expect(backoffSeconds(1, () => 0)).toBe(2)
    expect(backoffSeconds(2, () => 0)).toBe(4)
    expect(backoffSeconds(5, () => 0)).toBe(32)
    expect(backoffSeconds(50, () => 0.99)).toBe(300)
  })

  test("manual retry resumes the same execution without repeating finished side effects", async () => {
    const client = await database()
    const org = await organization(client, "resume")
    const flow = await activeWorkflow(client, org, linear(manual, followUp, email))
    let emailWorks = false
    const tracked = effects({
      async sendEmail(_input, context) {
        if (!emailWorks) throw new WorkflowStepError("mailbox full", false)
        return { providerId: context.idempotencyKey }
      },
    })
    const executionId = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "w1", { executionId, effects: tracked.value })
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("failed")

    await expect(retryWorkflowExecution(client, org.member, executionId)).rejects.toMatchObject({
      code: "forbidden",
    })
    emailWorks = true
    expect(await retryWorkflowExecution(client, org.editor, executionId)).toBe("retry_scheduled")
    await processWorkflowJobs(client, "w2", { executionId, effects: tracked.value })
    const detail = await executionDetail(client, org.owner, executionId)
    expect(detail.status).toBe("succeeded")
    expect(detail.manualRetryCount).toBe(1)
    expect(tracked.calls.followUp).toBe(1)
    expect(tracked.calls.email).toBe(2)
    expect(
      detail.steps.find((step) => step.nodeId === "mail" && step.status === "succeeded")?.output,
    ).toEqual({
      providerId: `${executionId}:mail`,
    })
    await expect(retryWorkflowExecution(client, org.owner, executionId)).rejects.toMatchObject({
      code: "execution_not_failed",
    })
  })

  test("manual retries are capped", async () => {
    const client = await database()
    const org = await organization(client, "cap")
    const flow = await activeWorkflow(client, org, linear(manual, email))
    const failing = effects({
      async sendEmail() {
        throw new WorkflowStepError("nope", false)
      },
    })
    const executionId = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "w0", { executionId, effects: failing.value })
    for (let index = 1; index <= 3; index += 1) {
      await retryWorkflowExecution(client, org.owner, executionId)
      await processWorkflowJobs(client, `w${index}`, { executionId, effects: failing.value })
    }
    await expect(retryWorkflowExecution(client, org.owner, executionId)).rejects.toMatchObject({
      code: "retry_limit",
    })
  })
})

describe("worker recovery and leases", () => {
  test("a job abandoned mid-run is recovered and resumed without repeating the finished step", async () => {
    const client = await database()
    const org = await organization(client, "crash")
    const flow = await activeWorkflow(client, org, linear(manual, followUp, email))
    const executionId = await testRun(client, org, flow.id)

    // Worker A claims the job, finishes the follow-up step, then dies.
    const claim = await client.query<{ job_id: string }>(
      "select * from app_claim_workflow_job('worker-a', $1::uuid)",
      [executionId],
    )
    expect(claim.rows).toHaveLength(1)
    const attempt = await client.query<{ attempt: number }>(
      "select app_workflow_mark_running($1::uuid) as attempt",
      [executionId],
    )
    const task = await client.query<{ id: string }>(
      "select app_workflow_create_follow_up($1::uuid, 'task', null, 'Call', '', $2) as id",
      [executionId, `${executionId}:task`],
    )
    for (const nodeId of ["start", "task"]) {
      await client.query(
        "select app_workflow_log_step($1::uuid, $2, 'succeeded', $3::jsonb, null, $4, now(), 1)",
        [
          executionId,
          nodeId,
          nodeId === "task" ? JSON.stringify({ taskId: task.rows[0]?.id }) : "{}",
          attempt.rows[0]?.attempt,
        ],
      )
    }
    // A fresh worker does not steal a live lease.
    expect(
      await processWorkflowJobs(client, "worker-b", { executionId, effects: effects().value }),
    ).toBe(0)

    await client.query(
      "update jobs set locked_at = now() - interval '10 minutes' where id = $1::uuid",
      [claim.rows[0]?.job_id],
    )
    const tracked = effects()
    expect(
      await processWorkflowJobs(client, "worker-b", { executionId, effects: tracked.value }),
    ).toBe(1)
    const detail = await executionDetail(client, org.owner, executionId)
    expect(detail.status).toBe("succeeded")
    expect(detail.attemptCount).toBe(2)
    expect(tracked.calls.followUp).toBe(0)
    expect(tracked.calls.email).toBe(1)
    expect(detail.job?.attempts).toBe(2)
  })

  test("a worker that loses its lease stops before the next side effect", async () => {
    const client = await database()
    const org = await organization(client, "fence")
    const flow = await activeWorkflow(client, org, linear(manual, followUp, email))
    const executionId = await testRun(client, org, flow.id)
    let takeover: Promise<number> | null = null
    const slowA = effects({
      async createFollowUp() {
        // While A works, its lease expires and B recovers and claims the job.
        await client.query(
          "update jobs set locked_at = now() - interval '10 minutes' where payload->>'executionId' = $1",
          [executionId],
        )
        await client.query("select app_recover_workflow_jobs(120)")
        await makeDue(client, executionId)
        takeover = Promise.resolve(0)
        return { taskId: "from-a" }
      },
    })
    await processWorkflowJobs(client, "worker-a", { executionId, effects: slowA.value, limit: 1 })
    expect(takeover).not.toBeNull()
    expect(slowA.calls.email).toBe(0)
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("retry_scheduled")

    const b = effects()
    await processWorkflowJobs(client, "worker-b", { executionId, effects: b.value })
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("succeeded")
    expect(b.calls.followUp).toBe(0)
    expect(b.calls.email).toBe(1)
  })

  test("an unexpected crash inside a job schedules a retry instead of losing it", async () => {
    const client = await database()
    const org = await organization(client, "boom")
    const flow = await activeWorkflow(client, org, linear(manual, followUp))
    const executionId = await testRun(client, org, flow.id)
    let first = true
    const crashing = effects({
      async createFollowUp() {
        if (first) {
          first = false
          throw new TypeError("socket hang up")
        }
        return { taskId: "ok" }
      },
    })
    await processWorkflowJobs(client, "w1", { executionId, effects: crashing.value })
    const waiting = await executionDetail(client, org.owner, executionId)
    expect(waiting.status).toBe("retry_scheduled")
    expect(waiting.error).toBe("The step failed unexpectedly.")
    await makeDue(client, executionId)
    await processWorkflowJobs(client, "w2", { executionId, effects: crashing.value })
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("succeeded")
  })
})

describe("timeouts and limits", () => {
  test("a hung step times out and is retried; a passed deadline fails permanently", async () => {
    const client = await database()
    const org = await organization(client, "slow")
    const flow = await activeWorkflow(client, org, linear(manual, email))
    const hung = effects({
      sendEmail: () => new Promise(() => undefined),
    })
    const executionId = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "w1", {
      executionId,
      effects: hung.value,
      limits: { stepTimeoutMs: 30 },
    })
    const detail = await executionDetail(client, org.owner, executionId)
    expect(detail.status).toBe("retry_scheduled")
    expect(detail.steps.at(-1)).toMatchObject({
      nodeId: "mail",
      status: "failed",
      error: "The step timed out.",
    })

    await client.query(
      "alter table workflow_executions disable trigger workflow_executions_transition",
    )
    await client.query(
      "update workflow_executions set deadline_at = now() - interval '1 minute' where id = $1::uuid",
      [executionId],
    )
    await client.query(
      "alter table workflow_executions enable trigger workflow_executions_transition",
    )
    await makeDue(client, executionId)
    await processWorkflowJobs(client, "w2", { executionId, effects: effects().value })
    const expired = await executionDetail(client, org.owner, executionId)
    expect(expired.status).toBe("failed")
    expect(expired.error).toBe("The execution passed its time limit.")
  })

  test("the graph runner enforces a step limit and an attempt time budget", async () => {
    const definition = linear(
      manual,
      { id: "a", type: "text_transform", position: at(1), config: { template: "a" } },
      { id: "b", type: "text_transform", position: at(2), config: { template: "b" } },
    )
    const base = {
      executionId: "00000000-0000-4000-8000-000000000000",
      completed: new Set<string>(),
      isCancelled: async () => false,
      effects: effects().value,
      onStep: async () => undefined,
    }
    const limited = await runWorkflowGraph(definition, {}, { ...base, limits: { maxSteps: 2 } })
    expect(limited).toMatchObject({
      status: "failed",
      error: "The workflow exceeded the step limit.",
      retryable: false,
    })
    let clock = 0
    const timed = await runWorkflowGraph(
      definition,
      {},
      {
        ...base,
        now: () => (clock += 20_000),
        limits: { attemptDurationMs: 30_000 },
      },
    )
    expect(timed).toMatchObject({ status: "failed", retryable: true })
  })
})

describe("cancellation", () => {
  test("queued, scheduled-for-retry, and running executions can be cancelled", async () => {
    const client = await database()
    const org = await organization(client, "cancel")
    const flow = await activeWorkflow(client, org, linear(manual, followUp, email))

    const queued = await testRun(client, org, flow.id)
    expect(await cancelWorkflowExecution(client, org.owner, queued)).toBe("cancelled")
    expect(
      await processWorkflowJobs(client, "w1", { executionId: queued, effects: effects().value }),
    ).toBe(0)
    expect((await executionDetail(client, org.owner, queued)).status).toBe("cancelled")
    expect(await cancelWorkflowExecution(client, org.owner, queued)).toBe("cancelled")

    const retrying = await testRun(client, org, flow.id)
    await processWorkflowJobs(client, "w2", {
      executionId: retrying,
      effects: effects({
        async createFollowUp() {
          throw new WorkflowStepError("busy", true)
        },
      }).value,
    })
    expect((await executionDetail(client, org.owner, retrying)).status).toBe("retry_scheduled")
    expect(await cancelWorkflowExecution(client, org.owner, retrying)).toBe("cancelled")

    const running = await testRun(client, org, flow.id)
    const midway = effects({
      async createFollowUp() {
        expect(await cancelWorkflowExecution(client, org.editor, running)).toBe("cancel_requested")
        return { taskId: "t" }
      },
    })
    await processWorkflowJobs(client, "w3", { executionId: running, effects: midway.value })
    const detail = await executionDetail(client, org.owner, running)
    expect(detail.status).toBe("cancelled")
    expect(midway.calls.email).toBe(0)
    expect(detail.steps.at(-1)).toMatchObject({ nodeId: "mail", status: "cancelled" })
    expect(detail.job?.status).toBe("succeeded")
  })

  test("a cancel that lands after a claim stops the worker before any step", async () => {
    const client = await database()
    const org = await organization(client, "race")
    const flow = await activeWorkflow(client, org, linear(manual, followUp))
    const executionId = await testRun(client, org, flow.id)
    const claim = await client.query<{ job_id: string }>(
      "select * from app_claim_workflow_job('w1', $1::uuid)",
      [executionId],
    )
    expect(await cancelWorkflowExecution(client, org.owner, executionId)).toBe("cancel_requested")
    const attempt = await client.query<{ attempt: number | null }>(
      "select app_workflow_mark_running($1::uuid) as attempt",
      [executionId],
    )
    expect(attempt.rows[0]?.attempt).toBeNull()
    await client.query(
      "select app_workflow_settle_execution($1::uuid, 'cancelled', null, 'cancelled', 0)",
      [executionId],
    )
    await client.query("select app_finish_workflow_job($1::uuid, 'w1', 'succeeded', '', 0)", [
      claim.rows[0]?.job_id,
    ])
    expect((await executionDetail(client, org.owner, executionId)).status).toBe("cancelled")
  })
})

describe("concurrency, quotas, and the kill switch", () => {
  test("parallel claims never return the same job, and per-organization running limits hold", async () => {
    const client = await database()
    const org = await organization(client, "claims")
    const flow = await activeWorkflow(client, org, linear(manual, followUp))
    for (let index = 0; index < 6; index += 1) await testRun(client, org, flow.id)
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        client.query<{ job_id: string }>("select * from app_claim_workflow_job($1, null)", [
          `w${index}`,
        ]),
      ),
    )
    const ids = claims.flatMap((claim) => claim.rows.map((row) => row.job_id))
    expect(ids).toHaveLength(5) // default max_running is 5 per organization
    expect(new Set(ids).size).toBe(5)

    const other = await organization(client, "limited")
    await client.query(
      "insert into workflow_org_limits (organization_id, max_running) values ($1::uuid, 1)",
      [other.id],
    )
    const otherFlow = await activeWorkflow(client, other, linear(manual, followUp))
    await testRun(client, other, otherFlow.id)
    await testRun(client, other, otherFlow.id)
    const first = await client.query(
      "select * from app_claim_workflow_job('x1', null) where tenant_id = $1::uuid",
      [other.id],
    )
    const second = await client.query(
      "select * from app_claim_workflow_job('x2', null) where tenant_id = $1::uuid",
      [other.id],
    )
    expect(first.rows).toHaveLength(1)
    expect(second.rows).toHaveLength(0)
  })

  test("hourly quotas reject new runs without breaking lead saves", async () => {
    const client = await database()
    const org = await organization(client, "quota")
    await client.query(
      "insert into workflow_org_limits (organization_id, executions_per_hour) values ($1::uuid, 1)",
      [org.id],
    )
    const flow = await activeWorkflow(client, org, leadFollowUpDefinition())
    await createLead(client, { ...org.owner, role: "owner" }, lead("Fay"))
    const second = await createLead(client, { ...org.owner, role: "owner" }, lead("Gus"))
    expect(second.name).toBe("Gus")
    expect(await listExecutions(client, org.owner, { workflowId: flow.id })).toHaveLength(1)
    await expect(testRun(client, org, flow.id)).rejects.toMatchObject({
      code: "workflow_quota",
      status: 429,
    })
  })

  test("the kill switch keeps accepted work queued until it is turned back on", async () => {
    const client = await database()
    const org = await organization(client, "kill")
    const flow = await activeWorkflow(client, org, leadFollowUpDefinition())
    await client.query("update workflow_runtime set enabled = false")
    await createLead(client, { ...org.owner, role: "owner" }, lead("Hal"))
    expect(await processWorkflowJobs(client, "w1")).toBe(0)
    const [run] = await listExecutions(client, org.owner, { workflowId: flow.id })
    expect(run?.status).toBe("queued")
    expect((await jobFor(client, run?.id ?? ""))?.status).toBe("pending")

    await client.query("update workflow_runtime set enabled = true")
    vi.stubEnv("WORKFLOW_EXECUTION_DISABLED", "true")
    expect(await processWorkflowJobs(client, "w2")).toBe(0)
    vi.unstubAllEnvs()
    expect(await processWorkflowJobs(client, "w3")).toBe(1)
    expect((await executionDetail(client, org.owner, run?.id ?? "")).status).toBe("succeeded")
  })
})

describe("tenant isolation", () => {
  test("another organization cannot see, cancel, or retry runs", async () => {
    const client = await database()
    const alpha = await organization(client, "alpha")
    const beta = await organization(client, "beta")
    const flow = await activeWorkflow(client, alpha, leadFollowUpDefinition())
    await createLead(client, { ...alpha.owner, role: "owner" }, lead("Ivy"))
    await processWorkflowJobs(client, "w1")
    const [run] = await listExecutions(client, alpha.owner)
    const executionId = run?.id ?? ""

    await expect(getWorkflowOverview(client, beta.owner, flow.id)).rejects.toMatchObject({
      code: "not_found",
    })
    await expect(executionDetail(client, beta.owner, executionId)).rejects.toMatchObject({
      code: "not_found",
    })
    await expect(cancelWorkflowExecution(client, beta.owner, executionId)).rejects.toMatchObject({
      code: "not_found",
    })
    await expect(retryWorkflowExecution(client, beta.owner, executionId)).rejects.toMatchObject({
      code: "not_found",
    })
    expect(await listExecutions(client, beta.owner)).toEqual([])
    const tasks = await withTenant(client, { tenantId: beta.id, userId: beta.owner.userId }, (tx) =>
      tx.query("select id from follow_up_tasks"),
    )
    expect(tasks.rows).toHaveLength(0)
    // A user cannot act inside an organization they do not belong to.
    await expect(
      listExecutions(client, { organizationId: alpha.id, userId: beta.owner.userId, role: beta.owner.role }),
    ).rejects.toMatchObject({
      code: "forbidden",
    })
    // Beta's workflows cannot be started with alpha's id.
    await expect(
      enqueueWorkflowExecution(client, {
        organizationId: beta.id,
        workflowId: flow.id,
        versionId: flow.versionId,
        trigger: "lead_created",
        payload: {},
        idempotencyKey: null,
        test: false,
      }),
    ).rejects.toMatchObject({ code: "workflow_inactive" })
  })
})
