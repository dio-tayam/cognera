import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { aiRunRequestSchema } from "@/lib/ai/catalog"
import { requirePermission } from "@/lib/auth/require-permission"
import { aiLimits } from "@/lib/ai/config"
import { requireAiContext, requireAiMutation } from "@/lib/ai/context"
import { inputSize, runAiOperation } from "@/lib/ai/operations"
import { getAiProvider } from "@/lib/ai/provider"
import { AiError } from "@/lib/ai/types"
import { acquireSlot, recordAiUsage } from "@/lib/ai/usage"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

/**
 * Runs one AI operation and returns editable text. This route never publishes,
 * sends, or changes records: the person reviewing the output does that through
 * the normal, permission-checked screens.
 */
export async function POST(request: Request) {
  await connection()
  try {
    const access = await requireAiContext()
    if (!access.ok) return access.response
    const context = access.context
    const forbidden = requirePermission(context.role, "ai.use")
    if (forbidden) return forbidden
    const blocked = await requireAiMutation(context)
    if (blocked) return blocked

    const length = Number(request.headers.get("content-length") ?? "0")
    if (length > aiLimits.maxInputChars * 4) {
      return jsonError(413, "input_too_large", "The request is too large.")
    }
    const body: unknown = await request.json().catch(() => null)
    const parsed = aiRunRequestSchema.safeParse(body)
    if (!parsed.success) return jsonError(400, "invalid_request", "Choose an operation and fill in its fields.")

    const release = acquireSlot(context.organizationId, aiLimits.maxConcurrentPerOrg)
    if (!release) {
      return jsonError(429, "busy", "Your organization already has generations running. Wait for one to finish.")
    }

    const provider = getAiProvider()
    const started = Date.now()
    const usageBase = {
      operation: parsed.data.operation,
      model: provider.model,
      inputChars: inputSize(parsed.data.input),
    }
    const scope = { organizationId: context.organizationId, userId: context.userId, database: context.database }
    try {
      const result = await runAiOperation(provider, parsed.data.operation, parsed.data.input, {
        signal: request.signal,
      })
      await recordAiUsage(scope, {
        ...usageBase,
        model: result.model,
        status: "succeeded",
        errorCode: null,
        outputChars: result.text.length,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: result.durationMs,
      }).catch(() => logEvent("warn", "ai.usage_record_failed"))
      return jsonOk({ result })
    } catch (error) {
      if (error instanceof AiError) {
        if (error.code !== "invalid_input") {
          await recordAiUsage(scope, {
            ...usageBase,
            status: error.code === "cancelled" ? "cancelled" : "failed",
            errorCode: error.code,
            outputChars: 0,
            promptTokens: null,
            completionTokens: null,
            durationMs: Date.now() - started,
          }).catch(() => logEvent("warn", "ai.usage_record_failed"))
        }
        logEvent("warn", "ai.run_failed", { code: error.code, operation: parsed.data.operation })
        return Response.json(
          { ok: false, error: { code: error.code, message: error.message, hint: error.hint, retryable: error.retryable } },
          { status: error.status, headers: { "cache-control": "no-store" } },
        )
      }
      throw error
    } finally {
      release()
    }
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "ai.run_crashed")
    return jsonFromError(error)
  }
}
