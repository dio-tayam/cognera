import pg from "pg"
import type { SqlClient } from "@/lib/db/types"

type PgQueryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>
}

export type PgClientOptions = {
  connectionTimeoutMillis?: number
  queryTimeoutMillis?: number
  max?: number
}

function mapRows<T>(result: { rows: unknown[]; rowCount: number | null }): {
  rows: T[]
  rowCount: number
} {
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount ?? result.rows.length,
  }
}

function createSession(
  queryable: PgQueryable,
  hooks: {
    inTransaction?: boolean
    isolate?: SqlClient["isolate"]
    close?: () => Promise<void>
  },
): SqlClient {
  const session: SqlClient = {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await queryable.query(text, params ? [...params] : undefined)
      return mapRows<T>(result)
    },
    async exec(text: string) {
      await queryable.query(text)
    },
    async transaction(fn) {
      if (hooks.inTransaction) {
        throw new Error("Nested transactions are not supported.")
      }
      await queryable.query("begin")
      const tx = createSession(queryable, {
        inTransaction: true,
        isolate: async (inner) => inner(tx),
        close: async () => undefined,
      })
      try {
        const value = await fn(tx)
        await queryable.query("commit")
        return value
      } catch (error) {
        try {
          await queryable.query("rollback")
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "The transaction failed and rollback also failed.",
          )
        }
        throw error
      }
    },
    async isolate(fn) {
      if (!hooks.isolate) return fn(session)
      return hooks.isolate(fn)
    },
    async close() {
      if (hooks.close) await hooks.close()
    },
  }
  return session
}

export function createPgClient(connectionString: string, options: PgClientOptions = {}): SqlClient {
  const pool = new pg.Pool({
    connectionString,
    application_name: "cognera",
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    query_timeout: options.queryTimeoutMillis ?? 10_000,
    idleTimeoutMillis: 10_000,
  })

  return {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await pool.query(text, params ? [...params] : undefined)
      return mapRows<T>(result)
    },
    async exec(text: string) {
      await pool.query(text)
    },
    async transaction(fn) {
      const connection = await pool.connect()
      try {
        const session = createSession(connection, { close: async () => undefined })
        return await session.transaction(fn)
      } finally {
        connection.release()
      }
    },
    async isolate(fn) {
      const connection = await pool.connect()
      try {
        const session = createSession(connection, { close: async () => undefined })
        return await fn(session)
      } finally {
        connection.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}
