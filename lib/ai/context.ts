import "server-only"
import { readSupabaseConfig } from "@/lib/auth/config"
import { requireCrmContext, requireMutation } from "@/lib/crm/context"
import type { SqlClient } from "@/lib/db/types"
import { jsonError } from "@/lib/http/json"

export type AiContext = {
  mode: "session" | "preview"
  organizationId: string
  userId: string
  role: string
  database: SqlClient | null
}

const previewOrg = "00000000-0000-4000-8000-000000000000"

/**
 * Signed-in members of an organization use AI with their organization's usage
 * ledger. Local development without Supabase gets a preview context with
 * in-memory usage, which is never available in production builds.
 */
export async function requireAiContext(): Promise<
  { ok: true; context: AiContext } | { ok: false; response: Response }
> {
  if (readSupabaseConfig().state === "disabled") {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, response: jsonError(401, "unauthenticated", "Sign in to use AI features.") }
    }
    return {
      ok: true,
      context: { mode: "preview", organizationId: previewOrg, userId: "preview", role: "owner", database: null },
    }
  }
  const access = await requireCrmContext()
  if (!access.ok) return access
  return { ok: true, context: { mode: "session", ...access.context } }
}

const previewWindow = new Map<string, number[]>()

/** Rate limit for generation. Session mode uses the database limiter and origin check. */
export async function requireAiMutation(context: AiContext): Promise<Response | null> {
  if (context.mode === "session") return requireMutation("ai_generate", context.userId)
  const now = Date.now()
  const recent = (previewWindow.get(context.userId) ?? []).filter((at) => now - at < 600_000)
  if (recent.length >= 60) return jsonError(429, "rate_limited", "Too many requests. Wait and try again.")
  recent.push(now)
  previewWindow.set(context.userId, recent)
  return null
}
