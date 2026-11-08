import { loadEnvFiles } from "../lib/env/files"
import { blankToUndefined } from "../lib/env/values"
import { createPgClient } from "../lib/db/pg-client"

/**
 * Global workflow kill switch. Operator only: it needs DATABASE_MIGRATION_URL,
 * because the application role cannot change workflow_runtime.
 *
 * npm run workflows:kill-switch -- status
 * npm run workflows:kill-switch -- off "reason"   stop all claiming; accepted work stays queued
 * npm run workflows:kill-switch -- on             resume
 */
async function main(): Promise<void> {
  loadEnvFiles()
  const connectionString = blankToUndefined(process.env.DATABASE_MIGRATION_URL)
  if (!connectionString) {
    console.error("DATABASE_MIGRATION_URL is not configured.")
    process.exitCode = 2
    return
  }
  const [command = "status", ...rest] = process.argv.slice(2)
  if (!["status", "on", "off"].includes(command)) {
    console.error('Use "status", "on", or "off <reason>".')
    process.exitCode = 1
    return
  }
  const database = createPgClient(connectionString)
  try {
    if (command !== "status") {
      await database.query(
        "update workflow_runtime set enabled = $1, reason = $2, updated_by = $3, updated_at = now() where id = 1",
        [command === "on", rest.join(" ").slice(0, 300) || null, process.env.USER ?? "operator"],
      )
    }
    const rows = await database.query<{
      enabled: boolean
      reason: string | null
      updated_at: Date
    }>("select enabled, reason, updated_at from workflow_runtime where id = 1")
    const row = rows.rows[0]
    console.log(
      `workflow execution is ${row?.enabled ? "ON" : "OFF"}${row?.reason ? ` (${row.reason})` : ""}, changed ${row?.updated_at ? new Date(row.updated_at).toISOString() : "never"}`,
    )
  } finally {
    await database.close()
  }
}

void main()
