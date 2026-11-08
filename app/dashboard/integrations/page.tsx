import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
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
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
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
  ]

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Database, Supabase, and Ollama status come from the health report. Billing and email are not connected."
      />
      <div className="grid gap-4">
        {live.map((item) => (
          <IntegrationCard key={item.name} name={item.name} check={item.check} />
        ))}
        <UnavailableCard
          name="Email delivery"
          detail="Contact messages and invitations are not sent."
        />
        <UnavailableCard name="Billing" detail="Plans cannot be purchased." />
      </div>
    </>
  )
}

function IntegrationCard({ name, check }: { name: string; check: HealthCheck }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          {name}
          <Badge variant={badgeVariant[check.status]}>{check.status}</Badge>
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
