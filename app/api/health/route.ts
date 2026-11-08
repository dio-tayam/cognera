import { connection } from "next/server"
import { unstable_rethrow } from "next/navigation"
import { brand } from "@/config/brand"
import { getHealthReport, type HealthReport } from "@/lib/health/report"
import { publicErrorDetail } from "@/lib/errors"

function failureReport(detail: string): HealthReport {
  const blocked = { status: "blocked" as const, detail: "Not checked." }
  return {
    service: brand.name,
    status: "unhealthy",
    time: new Date().toISOString(),
    version: "unknown",
    checks: {
      app: { status: "fail", detail },
      database: blocked,
      migrations: blocked,
      supabase: blocked,
      ollama: blocked,
      email: blocked,
    },
  }
}

export async function GET() {
  await connection()
  try {
    const report = await getHealthReport()
    return Response.json(report, {
      status: report.status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    unstable_rethrow(error)
    console.error("Health check failed:", publicErrorDetail(error))
    return Response.json(failureReport("The health check threw an unexpected error."), {
      status: 503,
      headers: { "cache-control": "no-store" },
    })
  }
}
