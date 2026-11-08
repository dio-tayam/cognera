import { loadEnvFiles } from "../lib/env/files"
import { blankToUndefined } from "../lib/env/values"
import { createPgClient } from "../lib/db/pg-client"
import { publicErrorDetail } from "../lib/errors"

async function main(): Promise<void> {
  loadEnvFiles()

  const connectionString = blankToUndefined(process.env.DATABASE_URL)
  if (!connectionString) {
    console.error("blocked: DATABASE_URL is not set, so the application role was not checked.")
    process.exitCode = 2
    return
  }

  const client = createPgClient(connectionString, { max: 1 })
  try {
    const result = await client.query<{ current_user: string; usesuper: boolean }>(
      "select current_user, usesuper from pg_user where usename = current_user",
    )
    const row = result.rows[0]
    if (!row) throw new Error("The database did not return the current role.")
    if (row.current_user !== "cognera_app") {
      throw new Error(`Expected to connect as cognera_app, connected as ${row.current_user}.`)
    }
    if (row.usesuper) throw new Error("cognera_app must not be a superuser.")
    await client.query("select 1 as ok")
    console.log("pass: connected as cognera_app, which is not a superuser.")
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
