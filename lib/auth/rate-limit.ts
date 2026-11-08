import "server-only"
import { headers } from "next/headers"
import { getAppDatabase } from "@/lib/db/app"
import { logEvent } from "@/lib/log/logger"
import { rateLimitBucket } from "@/lib/org/tokens"

const limits = {
  login: { attempts: 10, windowSeconds: 900 },
  register: { attempts: 5, windowSeconds: 900 },
  reset: { attempts: 5, windowSeconds: 900 },
  invite: { attempts: 20, windowSeconds: 3600 },
  contact: { attempts: 5, windowSeconds: 3600 },
  lead_write: { attempts: 60, windowSeconds: 3600 },
  lead_export: { attempts: 10, windowSeconds: 3600 },
  webhook: { attempts: 30, windowSeconds: 300 },
  workflow_write: { attempts: 600, windowSeconds: 3600 },
  workflow_run: { attempts: 120, windowSeconds: 3600 },
  ai_generate: { attempts: 120, windowSeconds: 3600 },
} as const

export type AuthAttempt = keyof typeof limits

/**
 * In-process fallback used only when the shared database limiter cannot be
 * reached. Requests are still limited (per server process), so a database
 * outage does not lock everyone out of signing in, and does not remove the limit.
 */
const memoryBuckets = new Map<string, number[]>()

function allowInMemory(bucket: string, attempts: number, windowSeconds: number): "ok" | "limited" {
  const now = Date.now()
  const recent = (memoryBuckets.get(bucket) ?? []).filter((at) => now - at < windowSeconds * 1000)
  if (recent.length >= attempts) {
    memoryBuckets.set(bucket, recent)
    return "limited"
  }
  recent.push(now)
  memoryBuckets.set(bucket, recent)
  if (memoryBuckets.size > 10_000) memoryBuckets.delete(memoryBuckets.keys().next().value!)
  return "ok"
}

/** Buckets are hashes, so the stored key is not an email address. */
export async function allowAuthAttempt(
  action: AuthAttempt,
  subject: string,
): Promise<"ok" | "limited" | "unavailable"> {
  const headerStore = await headers()
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwarded || headerStore.get("x-real-ip") || "local"
  const bucket = rateLimitBucket(action, `${ip}:${subject.toLowerCase()}`)
  const limit = limits[action]

  const database = getAppDatabase()
  if (!database) return allowInMemory(bucket, limit.attempts, limit.windowSeconds)

  try {
    const result = await database.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, $2, $3) as allowed",
      [bucket, limit.attempts, limit.windowSeconds],
    )
    return result.rows[0]?.allowed ? "ok" : "limited"
  } catch (error) {
    logEvent("warn", "auth.rate_limit_fallback", {
      detail: error instanceof Error ? error.message : "unavailable",
    })
    return allowInMemory(bucket, limit.attempts, limit.windowSeconds)
  }
}
