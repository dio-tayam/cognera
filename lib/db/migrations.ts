import path from "node:path"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import type { SqlClient } from "@/lib/db/types"

export type MigrationFile = {
  version: string
  name: string
  checksum: string
  sql: string
  filename: string
}

export type MigrationStatus = {
  applied: Array<{ version: string; name: string; checksum: string; appliedAt: string }>
  pending: MigrationFile[]
  checksumMismatches: Array<{ version: string; name: string }>
  tableMissing: boolean
}

const filePattern = /^(\d{4})_([a-z0-9_]+)\.sql$/

export function migrationsDirectory(cwd = process.cwd()): string {
  return path.join(cwd, "db", "migrations")
}

export async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory)
  const files = entries.filter((entry) => filePattern.test(entry)).sort()
  const migrations: MigrationFile[] = []

  for (const filename of files) {
    const match = filePattern.exec(filename)
    if (!match) continue
    const version = match[1]
    const name = match[2]
    if (!version || !name) continue
    const sql = await readFile(path.join(directory, filename))
    migrations.push({
      version,
      name,
      filename,
      sql: sql.toString("utf8"),
      checksum: createHash("sha256").update(sql).digest("hex"),
    })
  }

  const versions = new Set<string>()
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}.`)
    }
    versions.add(migration.version)
  }

  return migrations
}

async function migrationsTableExists(client: SqlClient): Promise<boolean> {
  const result = await client.query<{ name: string | null }>(
    "select to_regclass('public.schema_migrations')::text as name",
  )
  return result.rows[0]?.name != null
}

export async function getMigrationStatus(
  client: SqlClient,
  directory: string,
): Promise<MigrationStatus> {
  const files = await readMigrationFiles(directory)
  const tableMissing = !(await migrationsTableExists(client))
  if (tableMissing) {
    return { applied: [], pending: files, checksumMismatches: [], tableMissing: true }
  }

  const appliedRows = await client.query<{
    version: string
    name: string
    checksum: string
    applied_at: Date | string
  }>("select version, name, checksum, applied_at from schema_migrations order by version")

  const appliedByVersion = new Map(appliedRows.rows.map((row) => [row.version, row]))
  const pending: MigrationFile[] = []
  const checksumMismatches: Array<{ version: string; name: string }> = []
  const applied: MigrationStatus["applied"] = []

  for (const file of files) {
    const row = appliedByVersion.get(file.version)
    if (!row) {
      pending.push(file)
      continue
    }
    if (row.checksum !== file.checksum) {
      checksumMismatches.push({ version: file.version, name: file.name })
    }
    const appliedAt =
      row.applied_at instanceof Date
        ? row.applied_at.toISOString()
        : new Date(row.applied_at).toISOString()
    applied.push({
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt,
    })
  }

  return { applied, pending, checksumMismatches, tableMissing: false }
}

export async function migrate(client: SqlClient, directory: string): Promise<MigrationStatus> {
  return client.isolate(async (session) => {
    await session.query("select pg_advisory_lock(824611)")
    try {
      await session.exec(`
        create table if not exists schema_migrations (
          version text primary key,
          name text not null,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `)

      const files = await readMigrationFiles(directory)
      for (const file of files) {
        const existing = await session.query<{ checksum: string }>(
          "select checksum from schema_migrations where version = $1",
          [file.version],
        )
        const current = existing.rows[0]
        if (current) {
          if (current.checksum !== file.checksum) {
            throw new Error(
              `Migration ${file.version}_${file.name} was already applied with a different checksum.`,
            )
          }
          continue
        }

        await session.transaction(async (tx) => {
          await tx.exec(file.sql)
          await tx.query(
            "insert into schema_migrations (version, name, checksum) values ($1, $2, $3)",
            [file.version, file.name, file.checksum],
          )
        })
      }

      return getMigrationStatus(session, directory)
    } finally {
      await session.query("select pg_advisory_unlock(824611)")
    }
  })
}
