export type QueryResult<T> = {
  rows: T[]
  rowCount: number
}

export type SqlClient = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>
  exec(text: string): Promise<void>
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>
  /** Runs work on one database session so locks survive across statements. */
  isolate<T>(fn: (session: SqlClient) => Promise<T>): Promise<T>
  close(): Promise<void>
}
