import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireAiContext } from "@/lib/ai/context"
import { requirePermission } from "@/lib/auth/require-permission"
import { listAiUsage } from "@/lib/ai/usage"
import { jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

export async function GET() {
  await connection()
  try {
    const access = await requireAiContext()
    if (!access.ok) return access.response
    const forbidden = requirePermission(access.context.role, "ai.usage.view")
    if (forbidden) return forbidden
    const { organizationId, userId, database } = access.context
    return jsonOk(await listAiUsage({ organizationId, userId, database }))
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "ai.usage_failed")
    return jsonFromError(error)
  }
}
