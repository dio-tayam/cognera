import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, CalendarClock, FileText, Sparkles, UserPlus, Users, Workflow } from "lucide-react"
import { Suspense } from "react"
import { RefreshButton } from "@/components/dashboard/refresh-button"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { loadWorkspace } from "@/lib/app/access"
import { getContentAnalytics } from "@/lib/analytics/report"
import { requireCrmContext } from "@/lib/crm/context"
import { withTenant } from "@/lib/db/tenant"
import { getHealthReport } from "@/lib/health/report"
import type { HealthCheck } from "@/lib/health/schema"

export const metadata: Metadata = { title: "Overview" }

const metricIcons = [Users, Workflow, AlertTriangle, CalendarClock]

const badgeVariant = {
  pass: "success",
  fail: "destructive",
  blocked: "outline",
} as const

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewContent />
    </Suspense>
  )
}

async function OverviewContent() {
  const { records } = await loadWorkspace()
  const report = await getHealthReport()
  const fixture = records.source === "development-fixture"
  const live = fixture ? null : await organizationCounts()
  const content = fixture ? null : await contentCounts()
  const failures = records.runs.filter((run) => run.status === "failed").length
  const scheduled = records.automations.filter(
    (automation) => automation.trigger === "Schedule",
  ).length

  const metrics = [
    {
      label: "Leads",
      href: "/dashboard/leads" as const,
      value: fixture ? String(records.leads.length) : live ? String(live.leads) : "Unavailable",
      note: fixture
        ? "Development fixture count. Not a live pipeline."
        : live
          ? "Leads stored for the current organization."
          : "Choose an organization to see the lead count.",
    },
    {
      label: "Automations",
      href: "/dashboard/automations" as const,
      value: fixture
        ? String(records.automations.length)
        : live
          ? String(live.workflows)
          : "Unavailable",
      note: fixture
        ? "Development fixture drafts. They do not run."
        : live
          ? "Saved workflows for the current organization."
          : "Choose an organization to see saved workflows.",
    },
    {
      label: "Failed runs",
      href: "/dashboard/automations" as const,
      value: fixture ? String(failures) : live ? String(live.failed) : "Unavailable",
      note: fixture
        ? "Development fixture failures. Nothing executed."
        : live
          ? "Failed workflow executions. Open a workflow for the step log."
          : "Choose an organization to see failed executions.",
    },
    {
      label: "Scheduled tasks",
      href: "/dashboard/automations" as const,
      value: fixture ? String(scheduled) : live ? String(live.scheduled) : "Unavailable",
      note: fixture
        ? "Development fixture marked Schedule. No schedule is registered."
        : live
          ? "Active schedule rows. A worker must be running for them to fire."
          : "Choose an organization to see active schedules.",
    },
  ]

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          fixture
            ? "Counts appear only for labeled development fixtures. Live tenant metrics are not invented."
            : "Counts are stored records for the current organization."
        }
        actions={<RefreshButton />}
      />
      <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-ink-foreground sm:p-8">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_90%_at_90%_10%,black,transparent)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-xl flex-col gap-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-signal uppercase">Quick start</p>
            <p className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">What should Cognera automate next?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/dashboard/automations/new" as const, label: "New automation", icon: Workflow },
              { href: "/dashboard/ai" as const, label: "Ask the AI", icon: Sparkles },
              { href: "/dashboard/leads" as const, label: "Add a lead", icon: Users },
              { href: "/dashboard/cms/posts" as const, label: "Write a post", icon: FileText },
              { href: "/dashboard/settings/team" as const, label: "Invite a teammate", icon: UserPlus },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                <Icon className="size-4 text-signal" /> {label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? Users
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="group flex flex-col gap-4 rounded-3xl border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-[var(--elevation-2)]"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-brand" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="text-4xl font-semibold tracking-[-0.04em]">{metric.value}</p>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{metric.note}</p>
            </Link>
          )
        })}
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Content publishing</CardTitle>
            <CardDescription>
              {fixture
                ? "Publishing is not connected. Fixture documents stay drafts."
                : "Pages and posts are saved for this organization. Only published items are public."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fixture || !content ? (
              <p>
                {fixture
                  ? `${records.pages.length + records.posts.length} development fixture drafts. Published count is not shown because nothing is published.`
                  : "Open Pages or Posts to edit drafts. Unpublished items stay private."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link
                  href="/dashboard/cms/pages?status=published"
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-muted"
                >
                  <span className="text-muted-foreground">Published pages</span>
                  <span className="font-mono font-medium">{content.pages.published ?? 0}</span>
                </Link>
                <Link
                  href="/dashboard/cms/pages?status=draft"
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-muted"
                >
                  <span className="text-muted-foreground">Draft pages</span>
                  <span className="font-mono font-medium">{content.pages.draft ?? 0}</span>
                </Link>
                <Link
                  href="/dashboard/cms/posts?status=published"
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-muted"
                >
                  <span className="text-muted-foreground">Published posts</span>
                  <span className="font-mono font-medium">{content.posts.published ?? 0}</span>
                </Link>
                <Link
                  href="/dashboard/cms/posts?status=draft"
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2 transition hover:bg-muted"
                >
                  <span className="text-muted-foreground">Draft posts</span>
                  <span className="font-mono font-medium">{content.posts.draft ?? 0}</span>
                </Link>
              </div>
            )}
            <Link
              href="/dashboard/cms"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open content
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Integration health</CardTitle>
            <CardDescription>These rows come from the live health report.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <HealthLine label="Database" check={report.checks.database} />
            <HealthLine label="Supabase" check={report.checks.supabase} />
            <HealthLine label="Ollama" check={report.checks.ollama} />
            <Link
              href="/dashboard/integrations"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open integrations
            </Link>
          </CardContent>
        </Card>
      </section>
    </>
  )
}

async function contentCounts() {
  const access = await requireCrmContext()
  if (!access.ok) return null
  try {
    return await getContentAnalytics(access.context.database, access.context)
  } catch {
    return null
  }
}

async function organizationCounts(): Promise<{
  leads: number
  workflows: number
  failed: number
  scheduled: number
} | null> {
  const access = await requireCrmContext()
  if (!access.ok) return null
  try {
    return await withTenant(
      access.context.database,
      { tenantId: access.context.organizationId, userId: access.context.userId },
      async (tx) => {
        const result = await tx.query<{
          leads: number
          workflows: number
          failed: number
          scheduled: number
        }>(
          `select
           (select count(*)::int from leads) as leads,
           (select count(*)::int from workflows) as workflows,
           (select count(*)::int from workflow_executions where status = 'failed') as failed,
           (select count(*)::int from scheduled_jobs where status = 'active') as scheduled`,
        )
        return result.rows[0] ?? { leads: 0, workflows: 0, failed: 0, scheduled: 0 }
      },
    )
  } catch {
    return null
  }
}

function HealthLine({ label, check }: { label: string; check: HealthCheck }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{check.detail}</p>
      </div>
      <Badge variant={badgeVariant[check.status]}>{check.status}</Badge>
    </div>
  )
}
