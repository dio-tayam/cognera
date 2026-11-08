import { z } from "zod"

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

export type PageResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

export function pageCount(total: number, pageSize: number): number {
  if (total <= 0) return 0
  return Math.ceil(total / pageSize)
}
