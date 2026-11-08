import { PGlite, type Transaction } from "@electric-sql/pglite"
import type { SqlClient } from "@/lib/db/types"

function rowsOf<T>(result: { rows: T[]; rowCount?: number | null }): {
  rows: T[]
  rowCount: number
} {
  return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length }
}

function sessionFromTransaction(tx: Transaction): SqlClient {
  return {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await tx.query<T>(text, params ? [...params] : [])
      return rowsOf(result)
    },
    async exec(text: string) {
      await tx.exec(text)
    },
    transaction() {
      return Promise.reject(new Error("Nested transactions are not supported."))
    },
    async isolate(fn) {
      return fn(sessionFromTransaction(tx))
    },
    async close() {
      return undefined
    },
  }
}

export function createPgliteClient(db: PGlite): SqlClient {
  const client: SqlClient = {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await db.query<T>(text, params ? [...params] : [])
      return rowsOf(result)
    },
    async exec(text: string) {
      await db.exec(text)
    },
    async transaction(fn) {
      return db.transaction(async (tx) => fn(sessionFromTransaction(tx)))
    },
    async isolate(fn) {
      return fn(client)
    },
    async close() {
      await db.close()
    },
  }
  return client
}
