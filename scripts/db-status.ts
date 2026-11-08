import { loadEnvFiles } from "../lib/env/files"
import { blankToUndefined } from "../lib/env/values"
import { createPgClient } from "../lib/db/pg-client"
import { getMigrationStatus, migrationsDirectory } from "../lib/db/migrations"
import { publicErrorDetail } from "../lib/errors"

async function main(): Promise<void> {
  loadEnvFiles()

  const connectionString =
    blankToUndefined(process.env.DATABASE_MIGRATION_URL) ??
    blankToUndefined(process.env.DATABASE_URL)

  if (!connectionString) {
    console.error(
      "blocked: set DATABASE_MIGRATION_URL or DATABASE_URL before checking migration status.",
    )
    process.exitCode = 2
    return
  }

  const client = createPgClient(connectionString, { max: 1 })
  try {
    const status = await getMigrationStatus(client, migrationsDirectory())
    if (status.tableMissing) {
      console.error("failed: schema_migrations is missing. Run npm run db:migrate.")
      process.exitCode = 1
      return
    }
    for (const row of status.applied) {
      console.log(`applied ${row.version} ${row.name} ${row.appliedAt}`)
    }
    for (const row of status.pending) {
      console.log(`pending ${row.version} ${row.name}`)
    }
    for (const row of status.checksumMismatches) {
      console.error(`checksum mismatch ${row.version} ${row.name}`)
    }
    if (status.checksumMismatches.length > 0 || status.pending.length > 0) {
      process.exitCode = 1
      return
    }
    console.log("pass: database schema matches the migration files.")
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
