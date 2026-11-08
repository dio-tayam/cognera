import { z } from "zod"
import packageJson from "../../package.json"
import { brand } from "@/config/brand"
import { serviceRoleKeyPresent, readSupabaseConfig } from "@/lib/auth/config"
import { createPgClient } from "@/lib/db/pg-client"
import { getMigrationStatus, migrationsDirectory } from "@/lib/db/migrations"
import { blankToUndefined } from "@/lib/env/values"
import { publicErrorDetail } from "@/lib/errors"
import { healthReportSchema, type HealthCheck, type HealthReport } from "@/lib/health/schema"

export type { HealthCheck, HealthReport }

const appVersion = packageJson.version

function blocked(detail: string): HealthCheck {
  return { status: "blocked", detail }
}

function failed(detail: string, latencyMs?: number): HealthCheck {
  return latencyMs === undefined
    ? { status: "fail", detail }
    : { status: "fail", detail, latencyMs }
}

async function checkDatabase(): Promise<{ database: HealthCheck; migrations: HealthCheck }> {
  const raw = blankToUndefined(process.env.DATABASE_URL)
  if (!raw) {
    return {
      database: blocked("DATABASE_URL is not set."),
      migrations: blocked("Migration status was not checked because DATABASE_URL is not set."),
    }
  }
  if (!z.url().safeParse(raw).success) {
    return {
      database: failed("DATABASE_URL is not a valid URL."),
      migrations: blocked("Migration status was not checked because DATABASE_URL is invalid."),
    }
  }

  const started = Date.now()
  const client = createPgClient(raw, {
    max: 1,
    connectionTimeoutMillis: 2_000,
    queryTimeoutMillis: 2_000,
  })
  try {
    await client.query("select 1 as ok")
    const latencyMs = Date.now() - started
    let migrations: HealthCheck
    try {
      const status = await getMigrationStatus(client, migrationsDirectory())
      if (status.tableMissing) {
        migrations = failed("schema_migrations is missing. Run npm run db:migrate.")
      } else if (status.checksumMismatches.length > 0) {
        const names = status.checksumMismatches.map((item) => item.version).join(", ")
        migrations = failed(`Applied migrations no longer match the files: ${names}.`)
      } else if (status.pending.length > 0) {
        const names = status.pending.map((item) => `${item.version}_${item.name}`).join(", ")
        migrations = failed(`Pending migrations: ${names}. Run npm run db:migrate.`)
      } else {
        migrations = {
          status: "pass",
          detail: `${status.applied.length} migrations applied.`,
        }
      }
    } catch (error) {
      migrations = failed(publicErrorDetail(error))
    }
    return {
      database: { status: "pass", detail: "Connected.", latencyMs },
      migrations,
    }
  } catch (error) {
    return {
      database: failed(publicErrorDetail(error), Date.now() - started),
      migrations: blocked(
        "Migration status was not checked because the database connection failed.",
      ),
    }
  } finally {
    await client.close()
  }
}

async function checkSupabase(): Promise<HealthCheck> {
  const config = readSupabaseConfig()
  if (config.state === "disabled") return blocked(config.reason)
  if (config.state === "invalid") return failed(config.reason)

  const url = blankToUndefined(process.env.SUPABASE_URL)
  const anonKey = blankToUndefined(process.env.SUPABASE_ANON_KEY)
  if (!url || !anonKey) return failed("Supabase Auth settings disappeared during the check.")

  const started = Date.now()
  try {
    const response = await fetch(new URL("/auth/v1/health", url), {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2_000),
    })
    const latencyMs = Date.now() - started
    if (!response.ok) {
      return failed(`Supabase auth health returned HTTP ${response.status}.`, latencyMs)
    }
    const serviceRole = serviceRoleKeyPresent()
      ? " A service-role key is present on the server and is used only for account deletion."
      : " No service-role key is set."
    return {
      status: "pass",
      detail: `Supabase auth health responded.${serviceRole}`,
      latencyMs,
    }
  } catch (error) {
    return failed(publicErrorDetail(error), Date.now() - started)
  }
}

async function checkOllama(): Promise<HealthCheck> {
  const raw = blankToUndefined(process.env.OLLAMA_BASE_URL)
  if (!raw) {
    return blocked("OLLAMA_BASE_URL is not set. Local AI inference is disabled.")
  }
  if (!z.url().safeParse(raw).success) {
    return failed("OLLAMA_BASE_URL is not a valid URL.")
  }

  const started = Date.now()
  try {
    const response = await fetch(new URL("/api/tags", raw), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2_000),
    })
    const latencyMs = Date.now() - started
    if (!response.ok) {
      return failed(`Ollama returned HTTP ${response.status}.`, latencyMs)
    }
    const body: unknown = await response.json()
    const models =
      body && typeof body === "object" && "models" in body && Array.isArray(body.models)
        ? body.models.length
        : null
    return {
      status: "pass",
      detail:
        models === null
          ? "Ollama responded without a model list."
          : `Ollama responded with ${models} local model${models === 1 ? "" : "s"}.`,
      latencyMs,
    }
  } catch (error) {
    return failed(publicErrorDetail(error), Date.now() - started)
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [databaseResult, supabase, ollama] = await Promise.all([
    checkDatabase(),
    checkSupabase(),
    checkOllama(),
  ])
  const checks = {
    app: { status: "pass" as const, detail: `Cognera AI ${appVersion} is running.` },
    database: databaseResult.database,
    migrations: databaseResult.migrations,
    supabase,
    ollama,
  }
  const report: HealthReport = {
    service: brand.name,
    status: Object.values(checks).some((check) => check.status === "fail") ? "unhealthy" : "ok",
    time: new Date().toISOString(),
    version: appVersion,
    checks,
  }
  return healthReportSchema.parse(report)
}
