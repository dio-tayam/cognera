import { loadEnvFiles } from "../lib/env/files"
import { blankToUndefined } from "../lib/env/values"
import { createPgClient } from "../lib/db/pg-client"
import { dispatchDueSchedules } from "../lib/workflows/dispatch"
import { executionDisabledByEnv, processWorkflowJobs, runWorkerLoop } from "../lib/workflows/worker"

/**
 * npm run workflows:work            one pass: recover, dispatch schedules, claim up to 25 jobs, exit.
 *                                   Suitable for cron or a scheduled container.
 * npm run workflows:work -- --loop  keep polling until SIGINT or SIGTERM. The current step
 *                                   finishes; an unfinished job is recovered by the lease timeout.
 */
async function main(): Promise<void> {
  loadEnvFiles()
  const connectionString = blankToUndefined(process.env.DATABASE_URL)
  if (!connectionString) {
    console.error("DATABASE_URL is not configured. No jobs were claimed.")
    process.exitCode = 2
    return
  }
  if (executionDisabledByEnv()) {
    console.error("WORKFLOW_EXECUTION_DISABLED is set. No jobs were claimed.")
    return
  }
  const database = createPgClient(connectionString)
  const workerId = `worker:${process.pid}:${Date.now().toString(36)}`
  try {
    if (process.argv.includes("--loop")) {
      const controller = new AbortController()
      const stop = () => {
        console.log("stopping after the current step")
        controller.abort()
      }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      console.log(`${workerId} polling for workflow jobs`)
      await runWorkerLoop(database, workerId, { signal: controller.signal })
      return
    }
    const scheduled = await dispatchDueSchedules(database)
    const processed = await processWorkflowJobs(database, workerId, { limit: 25 })
    console.log(
      `queued ${scheduled} scheduled run${scheduled === 1 ? "" : "s"}, processed ${processed} workflow job${processed === 1 ? "" : "s"}`,
    )
  } finally {
    await database.close()
  }
}

void main()
