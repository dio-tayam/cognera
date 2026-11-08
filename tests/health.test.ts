import { afterEach, describe, expect, test, vi } from "vitest"
import { getHealthReport } from "@/lib/health/report"

const keys = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OLLAMA_BASE_URL",
] as const

afterEach(() => {
  vi.unstubAllEnvs()
})

function clearIntegrationEnv(): void {
  for (const key of keys) vi.stubEnv(key, "")
}

describe("health report", () => {
  test("reports unconfigured services as blocked rather than failed", async () => {
    clearIntegrationEnv()
    const report = await getHealthReport()
    expect(report.service).toBe("Cognera AI")
    expect(report.status).toBe("ok")
    expect(report.checks.app.status).toBe("pass")
    expect(report.checks.database.status).toBe("blocked")
    expect(report.checks.migrations.status).toBe("blocked")
    expect(report.checks.supabase.status).toBe("blocked")
    expect(report.checks.ollama.status).toBe("blocked")
  })

  test("fails the database check when the configured server cannot be reached", async () => {
    clearIntegrationEnv()
    vi.stubEnv("DATABASE_URL", "postgres://cognera_app:cognera_local_app@127.0.0.1:1/cognera")
    const report = await getHealthReport()
    expect(report.status).toBe("unhealthy")
    expect(report.checks.database.status).toBe("fail")
    expect(report.checks.database.detail).not.toContain("cognera_local_app")
    expect(report.checks.migrations.status).toBe("blocked")
  })

  test("fails optional services that are configured but unreachable", async () => {
    clearIntegrationEnv()
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:1")
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key-not-a-secret-value")
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:1")
    const report = await getHealthReport()
    expect(report.checks.supabase.status).toBe("fail")
    expect(report.checks.ollama.status).toBe("fail")
    expect(report.checks.supabase.detail).not.toContain("test-anon-key")
  })
})
