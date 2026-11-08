import { sanitizeModelOutput } from "@/lib/ai/guard"
import { workflowTransformPrompt } from "@/lib/ai/workflow"
import {
  fillTemplate,
  isTriggerType,
  readPath,
  type WorkflowDefinition,
  type WorkflowNode,
} from "@/lib/workflows/definition"
import { workflowLimits } from "@/lib/workflows/limits"
import { UnsafeUrlError } from "@/lib/workflows/ssrf"

/** A step failure with an explicit retry decision. */
export class WorkflowStepError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "WorkflowStepError"
    this.retryable = retryable
  }
}

export type EffectContext = {
  /** Stable per execution and node, so a retried call can be deduplicated. */
  idempotencyKey: string
  signal: AbortSignal
}

export type WorkflowEffects = {
  createFollowUp: (
    input: { nodeId: string; leadId: string | null; title: string; body: string },
    context: EffectContext,
  ) => Promise<{ taskId: string }>
  sendEmail: (
    input: { to: string; subject: string; body: string },
    context: EffectContext,
  ) => Promise<{ providerId: string }>
  generateText: (prompt: string, context: EffectContext) => Promise<{ text: string }>
}

export type StepStatus = "succeeded" | "failed" | "skipped" | "cancelled"

export type GraphRunResult = {
  status: "succeeded" | "failed" | "cancelled" | "lease_lost"
  output: Record<string, unknown>
  error: string | null
  retryable: boolean
}

export type GraphRunOptions = {
  executionId: string
  completed: ReadonlySet<string>
  priorOutputs?: Record<string, unknown>
  isCancelled: () => Promise<boolean>
  /** Returns false when this worker no longer holds the job. */
  keepLease?: () => Promise<boolean>
  effects: WorkflowEffects
  onStep: (step: {
    nodeId: string
    status: StepStatus
    output: unknown
    error: string | null
    startedAt: Date
    durationMs: number
  }) => Promise<void>
  now?: () => number
  limits?: { maxSteps?: number; attemptDurationMs?: number; stepTimeoutMs?: number }
}

export async function runWorkflowGraph(
  definition: WorkflowDefinition,
  input: unknown,
  options: GraphRunOptions,
): Promise<GraphRunResult> {
  const now = options.now ?? Date.now
  const maxSteps = options.limits?.maxSteps ?? workflowLimits.maxSteps
  const attemptDurationMs = options.limits?.attemptDurationMs ?? workflowLimits.attemptDurationMs
  const stepTimeoutMs = options.limits?.stepTimeoutMs ?? workflowLimits.stepTimeoutMs
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, WorkflowDefinition["edges"]>()
  for (const edge of definition.edges) {
    const list = outgoing.get(edge.source) ?? []
    list.push(edge)
    outgoing.set(edge.source, list)
  }
  const trigger = definition.nodes.find((node) => isTriggerType(node.type))
  if (!trigger) {
    return { status: "failed", output: {}, error: "The workflow has no trigger.", retryable: false }
  }
  const state: Record<string, unknown> = { ...(options.priorOutputs ?? {}) }
  const started = now()
  let current: WorkflowNode | undefined = trigger
  let steps = 0
  while (current) {
    if (steps >= maxSteps) {
      return {
        status: "failed",
        output: state,
        error: "The workflow exceeded the step limit.",
        retryable: false,
      }
    }
    steps += 1
    const node: WorkflowNode = current
    if (options.completed.has(node.id)) {
      current = nextNode(node, outgoing, nodes, state[node.id])
      continue
    }
    if (now() - started > attemptDurationMs) {
      // Completed steps are kept, so the next attempt continues from here.
      return {
        status: "failed",
        output: state,
        error: "The attempt ran out of time and will continue on retry.",
        retryable: true,
      }
    }
    if (options.keepLease && !(await options.keepLease())) {
      return {
        status: "lease_lost",
        output: state,
        error: "Another worker took over this job.",
        retryable: true,
      }
    }
    if (await options.isCancelled()) {
      const at = new Date(now())
      await options.onStep({
        nodeId: node.id,
        status: "cancelled",
        output: null,
        error: "The execution was cancelled.",
        startedAt: at,
        durationMs: 0,
      })
      return {
        status: "cancelled",
        output: state,
        error: "The execution was cancelled.",
        retryable: false,
      }
    }
    const startedAt = new Date(now())
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), stepTimeoutMs)
    try {
      const output = await withTimeout(
        executeNode(node, { input, state }, options.effects, {
          idempotencyKey: `${options.executionId}:${node.id}`,
          signal: controller.signal,
        }),
        controller.signal,
      )
      state[node.id] = output
      await options.onStep({
        nodeId: node.id,
        status: "succeeded",
        output,
        error: null,
        startedAt,
        durationMs: Math.max(0, now() - startedAt.getTime()),
      })
      if (node.type === "end") break
      current = nextNode(node, outgoing, nodes, output)
    } catch (error) {
      const classified = classifyError(error, controller.signal.aborted)
      await options.onStep({
        nodeId: node.id,
        status: "failed",
        output: null,
        error: classified.message,
        startedAt,
        durationMs: Math.max(0, now() - startedAt.getTime()),
      })
      return {
        status: "failed",
        output: state,
        error: classified.message,
        retryable: classified.retryable,
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return { status: "succeeded", output: state, error: null, retryable: false }
}

/** Retryable: timeouts, unavailable services, unknown runtime errors. Permanent: bad data, refused URLs. */
export function classifyError(
  error: unknown,
  timedOut: boolean,
): { message: string; retryable: boolean } {
  if (timedOut) return { message: "The step timed out.", retryable: true }
  if (error instanceof WorkflowStepError) {
    return { message: error.message.slice(0, 500), retryable: error.retryable }
  }
  if (error instanceof UnsafeUrlError) return { message: error.message, retryable: false }
  return { message: "The step failed unexpectedly.", retryable: true }
}

function withTimeout<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new WorkflowStepError("The step timed out.", true))
      return
    }
    const onAbort = () => reject(new WorkflowStepError("The step timed out.", true))
    signal.addEventListener("abort", onAbort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

function nextNode(
  node: WorkflowNode,
  outgoing: Map<string, WorkflowDefinition["edges"]>,
  nodes: Map<string, WorkflowNode>,
  output: unknown,
): WorkflowNode | undefined {
  if (node.type === "end") return undefined
  const edges = outgoing.get(node.id) ?? []
  let handle: "next" | "true" | "false" = "next"
  if (node.type === "condition") {
    const pass =
      output !== null && typeof output === "object" && "pass" in output
        ? Boolean((output as { pass?: unknown }).pass)
        : false
    handle = pass ? "true" : "false"
  }
  const target = edges.find((edge) => edge.sourceHandle === handle)?.target
  return target ? nodes.get(target) : undefined
}

async function executeNode(
  node: WorkflowNode,
  data: { input: unknown; state: Record<string, unknown> },
  effects: WorkflowEffects,
  context: EffectContext,
): Promise<unknown> {
  switch (node.type) {
    case "manual":
    case "lead_created":
    case "webhook":
    case "schedule":
      return { triggered: node.type }
    case "condition": {
      const value = readPath(data, node.config.path)
      const expected = node.config.value ?? ""
      const text = value === undefined || value === null ? "" : String(value)
      const pass =
        node.config.operator === "exists"
          ? text !== ""
          : node.config.operator === "equals"
            ? text === expected
            : node.config.operator === "not_equals"
              ? text !== expected
              : text.includes(expected)
      return { pass }
    }
    case "text_transform":
      return { text: fillTemplate(node.config.template, data).slice(0, 4_000) }
    case "follow_up": {
      const lead = readPath(data, "input.lead.id")
      return effects.createFollowUp(
        {
          nodeId: node.id,
          leadId: typeof lead === "string" ? lead : null,
          title: fillTemplate(node.config.title, data).slice(0, 200) || "Follow up",
          body: fillTemplate(node.config.body, data).slice(0, 2_000),
        },
        context,
      )
    }
    case "send_email": {
      const to = readPath(data, node.config.toPath)
      if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 320) {
        throw new WorkflowStepError("The email recipient is missing or not valid.", false)
      }
      return effects.sendEmail(
        {
          to,
          subject: fillTemplate(node.config.subject, data).slice(0, 200),
          body: fillTemplate(node.config.body, data).slice(0, 4_000),
        },
        context,
      )
    }
    case "generate_text":
      return effects.generateText(fillTemplate(node.config.prompt, data), context)
    case "ai_transform": {
      const source = fillTemplate(node.config.template, data).slice(0, 8_000)
      if (!source.trim()) return { text: "" }
      const result = await effects.generateText(
        workflowTransformPrompt(node.config.mode, source),
        context,
      )
      return { text: sanitizeModelOutput(result.text, 4_000) }
    }
    case "end":
      return { ended: true }
  }
}
