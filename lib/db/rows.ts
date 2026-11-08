import { z } from "zod"
import { AppError } from "@/lib/errors"

export const timestampSchema = z.union([z.date(), z.string().min(1)]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid timestamp from the database." })
    return z.NEVER
  }
  return date.toISOString()
})

export function parseRow<T>(schema: z.ZodType<T>, row: unknown, label: string): T {
  const parsed = schema.safeParse(row)
  if (!parsed.success) {
    throw new AppError("invalid_row", `The database returned an invalid ${label} row.`, 500)
  }
  return parsed.data
}

export function firstRow(rows: readonly unknown[], label: string): unknown {
  const row = rows[0]
  if (row === undefined) {
    throw new AppError("invalid_row", `The database returned no ${label} row.`, 500)
  }
  return row
}
