import "server-only"
import { createPgClient } from "@/lib/db/pg-client"
import type { SqlClient } from "@/lib/db/types"

let client: SqlClient | null | undefined

export function getAppDatabase(): SqlClient | null {
  if (client !== undefined) return client
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    client = null
    return client
  }
  client = createPgClient(url, { max: 5 })
  return client
}
