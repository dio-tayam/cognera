import { z } from "zod"
import { brand } from "@/config/brand"

export const checkStatuses = ["pass", "fail", "blocked"] as const

export const checkSchema = z.object({
  status: z.enum(checkStatuses),
  detail: z.string(),
  latencyMs: z.number().int().nonnegative().optional(),
})

export const healthReportSchema = z.object({
  service: z.literal(brand.name),
  status: z.enum(["ok", "unhealthy"]),
  time: z.string().min(1),
  version: z.string(),
  checks: z.object({
    app: checkSchema,
    database: checkSchema,
    migrations: checkSchema,
    supabase: checkSchema,
    ollama: checkSchema,
    email: checkSchema,
  }),
})

export type HealthCheck = z.infer<typeof checkSchema>
export type HealthReport = z.infer<typeof healthReportSchema>
