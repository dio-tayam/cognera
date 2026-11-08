import { loadEnvFiles } from "../lib/env/files"
import { blankToUndefined } from "../lib/env/values"
import { createPgClient } from "../lib/db/pg-client"
import { migrate, migrationsDirectory } from "../lib/db/migrations"
import { publicErrorDetail } from "../lib/errors"

async function main(): Promise<void> {
  loadEnvFiles()

  const migrationUrl =
    blankToUndefined(process.env.DATABASE_MIGRATION_URL) ??
    blankToUndefined(process.env.DATABASE_URL)

  if (!migrationUrl) {
    console.error("blocked: set DATABASE_MIGRATION_URL or DATABASE_URL before migrating.")
    process.exitCode = 2
    return
  }

  const client = createPgClient(migrationUrl, { max: 1 })
  try {
    const status = await migrate(client, migrationsDirectory())
    if (status.checksumMismatches.length > 0) {
      console.error("failed: applied migration checksums do not match the files.")
      process.exitCode = 1
      return
    }
    console.log(
      `pass: ${status.applied.length} migrations applied, ${status.pending.length} pending.`,
    )
  } catch (error) {
    console.error(`failed: ${publicErrorDetail(error)}`)
    process.exitCode = 1
  } finally {
    await client.close()
  }
}

main().catch((error: unknown) => {
  console.error(`failed: ${publicErrorDetail(error)}`)
  process.exitCode = 1
})
