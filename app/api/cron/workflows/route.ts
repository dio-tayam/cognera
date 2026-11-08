import { blankToUndefined } from "@/lib/env/values"
import { getAppDatabase } from "@/lib/db/app"
import { jsonError, jsonFromError, jsonOk } from "@/lib/http/json"
import { logEvent } from "@/lib/log/logger"
import { dispatchDueSchedules } from "@/lib/workflows/dispatch"
import { executionDisabledByEnv, processWorkflowJobs } from "@/lib/workflows/worker"

/**
 * One batch of due workflow work: dispatch due schedules, then claim and run up to
 * 25 jobs. Meant to be called on a schedule (e.g. an external cron service) since
 * serverless hosting has nothing like `npm run workflows:work --loop` running.
 * Protected the same way /api/email-relay is: a shared secret header, since this
 * route is otherwise a free way for anyone to burn through workflow execution limits.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = blankToUndefined(process.env.WORKFLOW_CRON_SECRET)
  if (!secret) {
    return jsonError(503, "cron_unconfigured", "WORKFLOW_CRON_SECRET is not set.")
  }
  const provided = request.headers.get("x-cron-secret")
  if (provided !== secret) {
    return jsonError(401, "unauthorized", "Invalid cron secret.")
  }

  const database = getAppDatabase()
  if (!database) {
    return jsonError(503, "database_unavailable", "The database is not configured.")
  }
  if (executionDisabledByEnv()) {
    return jsonOk({ scheduled: 0, processed: 0, disabled: true })
  }

  try {
    const scheduled = await dispatchDueSchedules(database)
    const workerId = `cron:${Date.now().toString(36)}`
    const processed = await processWorkflowJobs(database, workerId, { limit: 25 })
    return jsonOk({ scheduled, processed })
  } catch (error) {
    logEvent("error", "workflows.cron_failed")
    return jsonFromError(error)
  }
}
