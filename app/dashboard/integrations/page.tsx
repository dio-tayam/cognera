import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { RefreshButton } from "@/components/dashboard/refresh-button"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getHealthReport } from "@/lib/health/report"
import type { HealthCheck } from "@/lib/health/schema"

export const metadata: Metadata = { title: "Integrations" }

const badgeVariant = {
  pass: "success",
  fail: "destructive",
  blocked: "outline",
} as const

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Database, Supabase, Ollama, and email status come from the live health report."
        actions={<RefreshButton />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <IntegrationsContent />
      </Suspense>
    </>
  )
}

async function IntegrationsContent() {
  await connection()
  const report = await getHealthReport()
  const live = [
    { name: "Database", check: report.checks.database },
    { name: "Migrations", check: report.checks.migrations },
    { name: "Supabase", check: report.checks.supabase },
    { name: "Ollama", check: report.checks.ollama },
    { name: "Email delivery", check: report.checks.email },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {live.map((item) => (
        <IntegrationCard key={item.name} name={item.name} check={item.check} />
      ))}
      <UnavailableCard name="Billing" detail="Plans cannot be purchased." />
    </div>
  )
}

function IntegrationCard({ name, check }: { name: string; check: HealthCheck }) {
  return (
    <Card className="transition hover:shadow-[var(--elevation-2)]">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          {name}
          <div className="flex items-center gap-2">
            {check.latencyMs != null ? (
              <span className="font-mono text-xs text-muted-foreground">{check.latencyMs}ms</span>
            ) : null}
            <Badge variant={badgeVariant[check.status]}>{check.status}</Badge>
          </div>
        </CardTitle>
        <CardDescription>{check.detail}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function UnavailableCard({ name, detail }: { name: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          {name}
          <Badge variant="warning">Not connected</Badge>
        </CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-2">
        <Button type="button" disabled>
          Connect {name}
        </Button>
        <p className="text-sm text-muted-foreground">{detail} Connecting it is not available.</p>
      </CardContent>
    </Card>
  )
}
