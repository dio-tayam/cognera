import { z } from "zod"
import { can, type Permission, type Role } from "@/lib/auth/permissions"

/**
 * The only application actions an AI feature may ever request.
 *
 * A model can suggest one of these; it can never authorize one. Every request
 * is parsed against this fixed allowlist, and the caller's role is re-read on
 * the server immediately before execution. Consequential actions (anything
 * that publishes, sends, or changes access) are additionally refused unless a
 * workflow an authorized person configured explicitly permits that action.
 * Nothing here gives the model database credentials, shell, HTTP, or code
 * execution: executors are ordinary application functions.
 */

export const aiActionAllowlist = {
  "lead.add_note": { permission: "leads.edit", consequential: false },
  "lead.suggest_status": { permission: "leads.edit", consequential: false },
  "cms.save_draft": { permission: "content.edit", consequential: false },
  "cms.publish": { permission: "content.publish", consequential: true },
  "email.send": { permission: "leads.edit", consequential: true },
} as const satisfies Record<string, { permission: Permission; consequential: boolean }>

export type AiActionName = keyof typeof aiActionAllowlist

const uuid = z.uuid()

export const aiActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lead.add_note"), leadId: uuid, body: z.string().trim().min(1).max(4_000) }).strict(),
  z
    .object({
      action: z.literal("lead.suggest_status"),
      leadId: uuid,
      status: z.enum(["new", "contacted", "qualified", "archived"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("cms.save_draft"),
      kind: z.enum(["page", "post"]),
      title: z.string().trim().min(1).max(200),
      body: z.string().max(50_000),
    })
    .strict(),
  z.object({ action: z.literal("cms.publish"), kind: z.enum(["page", "post"]), id: uuid }).strict(),
  z
    .object({
      action: z.literal("email.send"),
      to: z.email().max(320),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(8_000),
    })
    .strict(),
])

export type AiActionRequest = z.infer<typeof aiActionRequestSchema>

export type AiActionDecision =
  | { allowed: true; request: AiActionRequest }
  | { allowed: false; reason: string }

export type AiActionContext = {
  /** Reads the caller's current role from the server at call time. Never from the request. */
  currentRole: () => Promise<Role | null>
  /** Actions an authorized person explicitly enabled for this workflow. Empty for interactive use. */
  workflowPermits: ReadonlySet<AiActionName>
}

export async function authorizeAiAction(
  request: unknown,
  context: AiActionContext,
): Promise<AiActionDecision> {
  const parsed = aiActionRequestSchema.safeParse(request)
  if (!parsed.success) return { allowed: false, reason: "The action is not on the allowlist or its fields are invalid." }

  const policy = aiActionAllowlist[parsed.data.action]
  const role = await context.currentRole()
  if (!can(role, policy.permission)) {
    return { allowed: false, reason: "Your role does not permit this action." }
  }
  if (policy.consequential && !context.workflowPermits.has(parsed.data.action)) {
    return {
      allowed: false,
      reason: "This action needs a person to confirm it, or a workflow that explicitly permits it.",
    }
  }
  return { allowed: true, request: parsed.data }
}

export type AiActionExecutors = {
  [K in AiActionName]?: (request: Extract<AiActionRequest, { action: K }>) => Promise<unknown>
}

/** Authorizes, then executes with the registered application function. Unknown actions never run. */
export async function runAiAction(
  request: unknown,
  context: AiActionContext,
  executors: AiActionExecutors,
): Promise<{ ok: true; result: unknown } | { ok: false; reason: string }> {
  const decision = await authorizeAiAction(request, context)
  if (!decision.allowed) return { ok: false, reason: decision.reason }
  const executor = executors[decision.request.action] as
    | ((request: AiActionRequest) => Promise<unknown>)
    | undefined
  if (!executor) return { ok: false, reason: "This action is not enabled in this installation." }
  return { ok: true, result: await executor(decision.request) }
}
