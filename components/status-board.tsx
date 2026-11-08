"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { healthReportSchema, type HealthCheck, type HealthReport } from "@/lib/health/schema"

const labels: Record<HealthCheck["status"], string> = {
  pass: "Passed",
  fail: "Failed",
  blocked: "Blocked",
}

const badgeVariant: Record<HealthCheck["status"], "default" | "destructive" | "outline"> = {
  pass: "default",
  fail: "destructive",
  blocked: "outline",
}

function summary(report: HealthReport): string {
  const blocked = Object.values(report.checks).filter((check) => check.status === "blocked").length
  if (report.status === "unhealthy") return "One or more checks failed."
  if (blocked > 0) {
    return "Cognera is running. Blocked checks were not executed because a service is not configured."
  }
  return "All configured checks passed."
}

export function StatusBoard({ initialReport }: { initialReport: HealthReport }) {
  const [report, setReport] = useState(initialReport)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function refresh() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/health", { cache: "no-store" })
      const body: unknown = await response.json()
      const parsed = healthReportSchema.safeParse(body)
      if (!parsed.success) {
        setError(`The health endpoint returned an unexpected response (HTTP ${response.status}).`)
        return
      }
      setReport(parsed.data)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The health endpoint could not be reached.",
      )
    } finally {
      setPending(false)
    }
  }

  const entries = Object.entries(report.checks) as Array<[string, HealthCheck]>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{summary(report)}</p>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          {pending ? "Refreshing status" : "Refresh status"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <dl className="grid gap-3">
        {entries.map(([name, check]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 capitalize">
                <span>{name}</span>
                <Badge variant={badgeVariant[check.status]}>{labels[check.status]}</Badge>
              </CardTitle>
              <CardDescription>{check.detail}</CardDescription>
            </CardHeader>
            {check.latencyMs !== undefined ? (
              <CardContent>
                <p className="text-muted-foreground">{check.latencyMs} ms</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Checked at {report.time}.</p>
    </div>
  )
}
