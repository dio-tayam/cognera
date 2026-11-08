import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, describe, expect, test } from "vitest"
import { getMigrationStatus, migrate } from "@/lib/db/migrations"
import { createPgliteClient } from "./helpers/pglite"
import { createMigratedDatabase } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe("migrations", () => {
  test("applies the project schema once and reports it as current", async () => {
    const client = await createMigratedDatabase()
    clients.push(client)
    const first = await getMigrationStatus(client, path.join(process.cwd(), "db", "migrations"))
    expect(first.pending).toHaveLength(0)
    expect(first.applied.map((row) => row.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
    ])

    const second = await migrate(client, path.join(process.cwd(), "db", "migrations"))
    expect(second.pending).toHaveLength(0)
    expect(second.checksumMismatches).toHaveLength(0)
  })

  test("refuses a changed checksum for an applied migration", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cognera-migrations-"))
    await writeFile(path.join(directory, "0001_note.sql"), "select 1;\n")
    const database = new PGlite()
    const client = createPgliteClient(database)
    clients.push(client)
    await migrate(client, directory)
    await writeFile(path.join(directory, "0001_note.sql"), "select 2;\n")
    await expect(migrate(client, directory)).rejects.toThrow(/different checksum/)
  })
})
