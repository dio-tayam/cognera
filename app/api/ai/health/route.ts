import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireAiContext } from "@/lib/ai/context"
import { suggestModel } from "@/lib/ai/hardware"
import { getAiProvider } from "@/lib/ai/provider"
import { jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"

export async function GET() {
  await connection()
  try {
    const access = await requireAiContext()
    if (!access.ok) return access.response
    const health = await getAiProvider().checkHealth()
    return jsonOk({ health, suggestion: suggestModel(), mode: access.context.mode })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "ai.health_failed")
    return jsonFromError(error)
  }
}
