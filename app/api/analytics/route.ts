import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { requireCrmContext } from "@/lib/crm/context"
import { jsonFromError, jsonOk } from "@/lib/http/json"
import { getAnalyticsOverview, getContentAnalytics } from "@/lib/analytics/report"
import { logEvent } from "@/lib/log/logger"

const allowedTrendDays = new Set([7, 14, 30])

export async function GET(request: Request) {
  await connection()
  try {
    const access = await requireCrmContext()
    if (!access.ok) return access.response
    const requested = Number(new URL(request.url).searchParams.get("days"))
    const trendDays = allowedTrendDays.has(requested) ? requested : 14
    const [overview, content] = await Promise.all([
      getAnalyticsOverview(access.context.database, access.context, { trendDays }),
      getContentAnalytics(access.context.database, access.context),
    ])
    return jsonOk({ overview, content })
  } catch (error) {
    unstable_rethrow(error)
    logEvent("error", "analytics.load_failed")
    return jsonFromError(error)
  }
}
