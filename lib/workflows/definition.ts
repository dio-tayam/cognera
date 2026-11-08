import { z } from "zod"
import { transformModes } from "@/lib/ai/catalog"
import { workflowLimits } from "@/lib/workflows/limits"

/**
 * Workflow definitions are JSON, version 1.
 * The graph is data. The worker runs a fixed set of node types.
 * It does not evaluate customer JavaScript, shell, SQL, or templates as code.
 */
export const workflowNodeTypes = [
  "manual",
  "lead_created",
  "webhook",
  "schedule",
  "condition",
  "text_transform",
  "follow_up",
  "send_email",
  "generate_text",
  "ai_transform",
  "end",
] as const

export type WorkflowNodeType = (typeof workflowNodeTypes)[number]

export const triggerTypes = ["manual", "lead_created", "webhook", "schedule"] as const
export type TriggerType = (typeof triggerTypes)[number]

export function isTriggerType(type: string): type is TriggerType {
  return (triggerTypes as readonly string[]).includes(type)
}

export const leadSourceOptions = ["manual", "contact_form", "referral", "import", "other"] as const

const idPattern = /^[a-z][a-z0-9_]{0,40}$/
const pathPattern = /^(input|state)(\.[A-Za-z0-9_]+)+$/
const nodeId = z.string().regex(idPattern, "Use a lowercase id.")
const pathSchema = z
  .string()
  .regex(pathPattern, "Use a field path such as input.lead.email or state.node_id.text.")
const positionSchema = z.object({
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
})

const nodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: nodeId,
    type: z.literal("manual"),
    position: positionSchema,
    config: z.object({}).strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("lead_created"),
    position: positionSchema,
    config: z.object({ source: z.enum(leadSourceOptions).nullable() }).strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("webhook"),
    position: positionSchema,
    config: z.object({}).strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("schedule"),
    position: positionSchema,
    config: z
      .object({
        intervalMinutes: z
          .number()
          .int("Use whole minutes.")
          .min(5, "Use at least 5 minutes.")
          .max(1440, "Use at most 1440 minutes."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("condition"),
    position: positionSchema,
    config: z
      .object({
        path: pathSchema,
        operator: z.enum(["equals", "not_equals", "contains", "exists"]),
        value: z.string().max(500, "Use at most 500 characters.").optional(),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("text_transform"),
    position: positionSchema,
    config: z
      .object({
        template: z
          .string()
          .trim()
          .min(1, "Enter a template.")
          .max(2000, "Use at most 2000 characters."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("follow_up"),
    position: positionSchema,
    config: z
      .object({
        title: z
          .string()
          .trim()
          .min(1, "Enter a task title.")
          .max(200, "Use at most 200 characters."),
        body: z.string().max(2000, "Use at most 2000 characters."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("send_email"),
    position: positionSchema,
    config: z
      .object({
        toPath: pathSchema,
        subject: z
          .string()
          .trim()
          .min(1, "Enter a subject.")
          .max(200, "Use at most 200 characters."),
        body: z.string().max(4000, "Use at most 4000 characters."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("generate_text"),
    position: positionSchema,
    config: z
      .object({
        prompt: z
          .string()
          .trim()
          .min(1, "Enter a prompt.")
          .max(4000, "Use at most 4000 characters."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("ai_transform"),
    position: positionSchema,
    config: z
      .object({
        mode: z.enum(transformModes),
        template: z
          .string()
          .trim()
          .min(1, "Enter the source text.")
          .max(2000, "Use at most 2000 characters."),
      })
      .strict(),
  }),
  z.object({
    id: nodeId,
    type: z.literal("end"),
    position: positionSchema,
    config: z.object({}).strict(),
  }),
])

export type WorkflowNode = z.infer<typeof nodeSchema>

const edgeSchema = z.object({
  id: z.string().regex(idPattern),
  source: nodeId,
  target: nodeId,
  sourceHandle: z.enum(["next", "true", "false"]),
})

export type WorkflowEdge = z.infer<typeof edgeSchema>

export const workflowDefinitionSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema).max(workflowLimits.maxNodes),
  edges: z.array(edgeSchema).max(workflowLimits.maxEdges),
})

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>

export type WorkflowIssue = { nodeId: string | null; message: string }

export type NodeAvailability =
  { kind: "built_in" } | { kind: "external"; setting: string; description: string }

export const nodeCatalog: Record<
  WorkflowNodeType,
  {
    label: string
    category: "trigger" | "logic" | "action" | "end"
    availability: NodeAvailability
    note: string
  }
> = {
  manual: {
    label: "Manual trigger",
    category: "trigger",
    availability: { kind: "built_in" },
    note: "Starts from Test run, or from Run now after the workflow is active.",
  },
  lead_created: {
    label: "Lead created",
    category: "trigger",
    availability: { kind: "built_in" },
    note: "Starts when a lead is saved in this organization. Each lead starts a workflow at most once.",
  },
  webhook: {
    label: "Webhook",
    category: "trigger",
    availability: { kind: "built_in" },
    note: "Starts from a signed HTTP request. Rotate the secret to reveal it once.",
  },
  schedule: {
    label: "Schedule",
    category: "trigger",
    availability: { kind: "built_in" },
    note: "Starts on an interval while the workflow is active and a worker process is running. Missed intervals are not replayed.",
  },
  condition: {
    label: "Condition",
    category: "logic",
    availability: { kind: "built_in" },
    note: "Compares a stored field and follows the yes or no path. It does not evaluate a script.",
  },
  text_transform: {
    label: "Text transformation",
    category: "logic",
    availability: { kind: "built_in" },
    note: "Fills {{input.field}} and {{state.node.field}} placeholders. Missing values become empty text.",
  },
  follow_up: {
    label: "Create follow-up task",
    category: "action",
    availability: { kind: "built_in" },
    note: "Saves a task for this organization. A retry does not create a second task.",
  },
  send_email: {
    label: "Send email",
    category: "action",
    availability: {
      kind: "external",
      setting: "EMAIL_WEBHOOK_URL",
      description: "Needs an HTTPS email provider endpoint configured by the operator.",
    },
    note: "Posts the message to the configured provider with an idempotency key. A provider that ignores the key can deliver twice after a retry.",
  },
  generate_text: {
    label: "Generate text",
    category: "action",
    availability: {
      kind: "external",
      setting: "OLLAMA_BASE_URL",
      description: "Needs the local AI service configured by the operator.",
    },
    note: "Sends the prompt to the local AI adapter and stores the text for later nodes as state.<node id>.text.",
  },
  ai_transform: {
    label: "AI text transformation",
    category: "action",
    availability: {
      kind: "external",
      setting: "OLLAMA_BASE_URL",
      description: "Needs the local AI service configured by the operator.",
    },
    note: "Rewrites, shortens, expands, or changes the tone of the filled source text with the local model. The source is passed as untrusted data, and the result is stored as state.<node id>.text. It never sends or publishes anything.",
  },
  end: {
    label: "End",
    category: "end",
    availability: { kind: "built_in" },
    note: "Stops this path.",
  },
}

export function emptyWorkflowDefinition(): WorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "manual", position: { x: 0, y: 0 }, config: {} },
      { id: "done", type: "end", position: { x: 320, y: 0 }, config: {} },
    ],
    edges: [{ id: "start_done", source: "start", target: "done", sourceHandle: "next" }],
  }
}

export function leadFollowUpDefinition(): WorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "lead_created", position: { x: 0, y: 0 }, config: { source: null } },
      {
        id: "check",
        type: "condition",
        position: { x: 240, y: 0 },
        config: { path: "input.lead.email", operator: "contains", value: "@" },
      },
      {
        id: "task",
        type: "follow_up",
        position: { x: 480, y: -40 },
        config: {
          title: "Follow up with {{input.lead.name}}",
          body: "New lead {{input.lead.email}}",
        },
      },
      { id: "done", type: "end", position: { x: 720, y: 0 }, config: {} },
      { id: "skip", type: "end", position: { x: 480, y: 120 }, config: {} },
    ],
    edges: [
      { id: "e_start", source: "start", target: "check", sourceHandle: "next" },
      { id: "e_yes", source: "check", target: "task", sourceHandle: "true" },
      { id: "e_task", source: "task", target: "done", sourceHandle: "next" },
      { id: "e_no", source: "check", target: "skip", sourceHandle: "false" },
    ],
  }
}

export function leadWelcomeEmailDefinition(): WorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "lead_created", position: { x: 0, y: 0 }, config: { source: null } },
      {
        id: "welcome",
        type: "send_email",
        position: { x: 280, y: 0 },
        config: {
          toPath: "input.lead.email",
          subject: "Thanks for reaching out, {{input.lead.name}}",
          body: "Hi {{input.lead.name}},\n\nThanks for contacting us. Someone from the team will follow up with you shortly.\n\n— Cognera",
        },
      },
      { id: "done", type: "end", position: { x: 560, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e_start", source: "start", target: "welcome", sourceHandle: "next" },
      { id: "e_welcome", source: "welcome", target: "done", sourceHandle: "next" },
    ],
  }
}

/** Maps schema errors to the node they belong to, so the editor can mark it. */
function schemaIssues(value: unknown, error: z.ZodError): WorkflowIssue[] {
  const rawNodes =
    value && typeof value === "object" && Array.isArray((value as { nodes?: unknown }).nodes)
      ? ((value as { nodes: unknown[] }).nodes as unknown[])
      : []
  const issues: WorkflowIssue[] = []
  const seen = new Set<string>()
  for (const issue of error.issues) {
    let nodeIdValue: string | null = null
    let message = "The workflow definition is not valid."
    if (issue.path[0] === "nodes" && typeof issue.path[1] === "number") {
      const raw = rawNodes[issue.path[1]] as { id?: unknown } | undefined
      nodeIdValue = typeof raw?.id === "string" && idPattern.test(raw.id) ? raw.id : null
      const field = issue.path
        .slice(2)
        .filter((part) => part !== "config")
        .join(".")
      message = field ? `${fieldLabel(field)}: ${issue.message}` : issue.message
    } else if (issue.path[0] === "nodes" && issue.code === "too_big") {
      message = `Use at most ${workflowLimits.maxNodes} nodes.`
    } else if (issue.path[0] === "edges") {
      message =
        issue.code === "too_big"
          ? `Use at most ${workflowLimits.maxEdges} connections.`
          : "A connection is not valid."
    }
    const key = `${nodeIdValue ?? ""}|${message}`
    if (seen.has(key)) continue
    seen.add(key)
    issues.push({ nodeId: nodeIdValue, message })
  }
  return issues.length > 0
    ? issues
    : [{ nodeId: null, message: "The workflow definition is not valid." }]
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    intervalMinutes: "Interval",
    path: "Field",
    toPath: "Recipient field",
    value: "Value",
    template: "Template",
    title: "Title",
    body: "Body",
    subject: "Subject",
    prompt: "Prompt",
    source: "Source",
    operator: "Operator",
    mode: "Transformation",
    "position.x": "Position",
    "position.y": "Position",
  }
  return labels[field] ?? field
}

const placeholder = /\{\{\s*([^{}]*?)\s*\}\}/g

function templateFields(node: WorkflowNode): string[] {
  switch (node.type) {
    case "text_transform":
      return [node.config.template]
    case "follow_up":
      return [node.config.title, node.config.body]
    case "send_email":
      return [node.config.subject, node.config.body]
    case "generate_text":
      return [node.config.prompt]
    case "ai_transform":
      return [node.config.template]
    default:
      return []
  }
}

export function validateWorkflowDefinition(value: unknown): {
  definition: WorkflowDefinition | null
  issues: WorkflowIssue[]
} {
  const parsed = workflowDefinitionSchema.safeParse(value)
  if (!parsed.success) {
    return { definition: null, issues: schemaIssues(value, parsed.error) }
  }
  const definition = parsed.data
  const issues: WorkflowIssue[] = []
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]))
  if (nodes.size !== definition.nodes.length) {
    issues.push({ nodeId: null, message: "Node ids must be unique." })
  }
  const triggers = definition.nodes.filter((node) => isTriggerType(node.type))
  if (triggers.length === 0) {
    issues.push({ nodeId: null, message: "Add one trigger." })
  } else if (triggers.length > 1) {
    for (const extra of triggers) {
      issues.push({ nodeId: extra.id, message: "A workflow needs exactly one trigger." })
    }
  }
  if (!definition.nodes.some((node) => node.type === "end")) {
    issues.push({ nodeId: null, message: "Add an end node." })
  }
  const edgeIds = new Set<string>()
  const outgoing = new Map<string, WorkflowEdge[]>()
  const pairs = new Set<string>()
  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) issues.push({ nodeId: null, message: "Edge ids must be unique." })
    edgeIds.add(edge.id)
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    if (!source || !target) {
      issues.push({
        nodeId: source ? edge.source : null,
        message: "A connection points at a missing node.",
      })
      continue
    }
    if (edge.source === edge.target) {
      issues.push({ nodeId: edge.source, message: "A node cannot connect to itself." })
    }
    if (isTriggerType(target.type)) {
      issues.push({ nodeId: target.id, message: "A trigger cannot have incoming connections." })
    }
    const pair = `${edge.source}|${edge.sourceHandle}|${edge.target}`
    if (pairs.has(pair)) {
      issues.push({ nodeId: edge.source, message: "This connection is duplicated." })
    }
    pairs.add(pair)
    const list = outgoing.get(edge.source) ?? []
    list.push(edge)
    outgoing.set(edge.source, list)
  }
  for (const node of definition.nodes) {
    const edges = outgoing.get(node.id) ?? []
    if (node.type === "end") {
      if (edges.length > 0) {
        issues.push({ nodeId: node.id, message: "The end node cannot have outgoing connections." })
      }
      continue
    }
    if (node.type === "condition") {
      const yes = edges.filter((edge) => edge.sourceHandle === "true").length
      const no = edges.filter((edge) => edge.sourceHandle === "false").length
      if (yes !== 1 || no !== 1) {
        issues.push({
          nodeId: node.id,
          message: "A condition needs exactly one yes path and one no path.",
        })
      }
      if (edges.some((edge) => edge.sourceHandle === "next")) {
        issues.push({
          nodeId: node.id,
          message: "Connect a condition through its yes and no outputs.",
        })
      }
      if (node.config.operator !== "exists" && node.config.value === undefined) {
        issues.push({ nodeId: node.id, message: "Value: Enter a value to compare." })
      }
    } else if (edges.length !== 1 || edges[0]?.sourceHandle !== "next") {
      issues.push({ nodeId: node.id, message: "Connect this node to exactly one next node." })
    }
    for (const text of templateFields(node)) {
      for (const match of text.matchAll(placeholder)) {
        const token = match[1] ?? ""
        if (!pathPattern.test(token)) {
          issues.push({
            nodeId: node.id,
            message: `The placeholder {{${token}}} is not a field path. Use {{input.field}} or {{state.node.field}}.`,
          })
        }
      }
    }
  }
  const trigger = triggers.length === 1 ? triggers[0] : undefined
  if (trigger && nodes.size === definition.nodes.length) {
    const seen = new Set<string>()
    const stack = [trigger.id]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || seen.has(current)) continue
      seen.add(current)
      for (const edge of outgoing.get(current) ?? []) stack.push(edge.target)
    }
    for (const node of definition.nodes) {
      if (!seen.has(node.id)) {
        issues.push({ nodeId: node.id, message: "This node is not reachable from the trigger." })
      }
    }
    const cycleNode = findCycle(definition.nodes, outgoing)
    if (cycleNode) {
      issues.push({ nodeId: cycleNode, message: "The workflow cannot contain a cycle." })
    }
  }
  return { definition, issues }
}

/** Returns a node on a cycle, checking every node rather than only the trigger's paths. */
function findCycle(nodes: WorkflowNode[], outgoing: Map<string, WorkflowEdge[]>): string | null {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function walk(id: string): string | null {
    if (visiting.has(id)) return id
    if (visited.has(id)) return null
    visiting.add(id)
    for (const edge of outgoing.get(id) ?? []) {
      const found = walk(edge.target)
      if (found) return found
    }
    visiting.delete(id)
    visited.add(id)
    return null
  }
  for (const node of nodes) {
    const found = walk(node.id)
    if (found) return found
  }
  return null
}

export type IntegrationStatus = { email: boolean; ai: boolean }

/**
 * Nodes that depend on operator configuration. A workflow can be saved and
 * test-run with these, but it cannot be activated until they are configured.
 */
export function readinessIssues(
  definition: WorkflowDefinition,
  integrations: IntegrationStatus,
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = []
  for (const node of definition.nodes) {
    if (node.type === "send_email" && !integrations.email) {
      issues.push({
        nodeId: node.id,
        message: "Email is not configured. Set EMAIL_WEBHOOK_URL before activating.",
      })
    }
    if ((node.type === "generate_text" || node.type === "ai_transform") && !integrations.ai) {
      issues.push({
        nodeId: node.id,
        message: "Ollama is not configured. Set OLLAMA_BASE_URL before activating.",
      })
    }
  }
  return issues
}

export function triggerOf(definition: WorkflowDefinition): WorkflowNode | undefined {
  return definition.nodes.find((node) => isTriggerType(node.type))
}

const fillToken = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g

export function fillTemplate(template: string, data: unknown): string {
  return template.replace(fillToken, (_match, token: string) => {
    if (!pathPattern.test(token)) return ""
    const value = readPath(data, token)
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : ""
  })
}

export function readPath(data: unknown, path: string): unknown {
  if (!pathPattern.test(path)) return undefined
  const parts = path.split(".")
  const root = data as { input?: unknown; state?: unknown } | null
  let current: unknown = parts[0] === "input" ? root?.input : root?.state
  for (const part of parts.slice(1)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
