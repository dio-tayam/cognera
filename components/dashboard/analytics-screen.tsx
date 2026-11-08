"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { EmptyState } from "@/components/layout/empty-state"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "cn"
import type { AnalyticsOverview, ContentAnalytics } from "@/lib/analytics/report"

type ApiError = { code: string; message: string }
type Payload = { overview: AnalyticsOverview; content: ContentAnalytics }
const trendRanges = [7, 14, 30] as const

async function readJson<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: ApiError }
    | null
  if (!body) return { ok: false, error: { code: "bad_response", message: `The server answered ${response.status}.` } }
  return body
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] tracking-[0.2em] uppercase">{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {note ? (
        <CardContent className="pt-0 text-sm text-muted-foreground">{note}</CardContent>
      ) : null}
    </Card>
  )
}

/** Horizontal bars for a categorical or status breakdown. Fixed color per label, never cycled.
 * Each row is a drill-down link into the filtered list when `hrefFor` resolves one. */
function BreakdownChart({
  title,
  data,
  colorFor,
  labelFor,
  hrefFor,
}: {
  title: string
  data: Array<{ key: string; value: number }>
  colorFor: (key: string) => string
  labelFor: (key: string) => string
  hrefFor?: (key: string) => string
}) {
  const max = Math.max(1, ...data.map((item) => item.value))
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{total} total</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {data.every((item) => item.value === 0) ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          data.map((item) => {
            const href = hrefFor?.(item.key)
            const row = (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition",
                  href && "cursor-pointer hover:bg-muted",
                )}
                title={`${labelFor(item.key)}: ${item.value}`}
              >
                <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">{labelFor(item.key)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", colorFor(item.key))}
                    style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">{item.value}</span>
              </div>
            )
            return href ? (
              <Link key={item.key} href={href}>
                {row}
              </Link>
            ) : (
              <div key={item.key}>{row}</div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

/** Daily trend as vertical bars. Single series, single hue (magnitude, not identity). */
function TrendChart({
  data,
  range,
  onRangeChange,
}: {
  data: Array<{ date: string; count: number }>
  range: (typeof trendRanges)[number]
  onRangeChange: (range: (typeof trendRanges)[number]) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((item) => item.count))
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 has-data-[slot=card-action]:grid-cols-1">
        <div>
          <CardTitle>Leads, last {range} days</CardTitle>
          <CardDescription>
            {active !== null
              ? `${data[active]!.date} · ${data[active]!.count} lead${data[active]!.count === 1 ? "" : "s"}`
              : `${data.reduce((sum, item) => sum + item.count, 0)} total`}
          </CardDescription>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {trendRanges.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onRangeChange(option)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition",
                option === range ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}d
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 gap-1.5" role="img" aria-label={`Leads created per day, last ${range} days`}>
          {data.map((item, index) => (
            <div
              key={item.date}
              className="flex flex-1 flex-col items-center gap-1"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive((current) => (current === index ? null : current))}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    "w-full min-h-[3px] rounded-t-[4px] bg-brand transition-opacity",
                    active !== null && active !== index ? "opacity-40" : "opacity-100",
                  )}
                  style={{ height: `${Math.max(3, (item.count / max) * 100)}%` }}
                  title={`${item.date}: ${item.count}`}
                />
              </div>
              {range <= 14 ? (
                <span className="font-mono text-[9px] text-muted-foreground">{item.date.slice(8)}</span>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const leadStatusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  archived: "Archived",
}
const leadStatusColor: Record<string, string> = {
  new: "bg-chart-1",
  contacted: "bg-chart-2",
  qualified: "bg-chart-3",
  archived: "bg-muted-foreground/40",
}

const runStatusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  retry_scheduled: "Retrying",
  cancelled: "Cancelled",
}
const runStatusColor: Record<string, string> = {
  queued: "bg-muted-foreground/40",
  running: "bg-chart-2",
  succeeded: "bg-success",
  failed: "bg-destructive",
  retry_scheduled: "bg-warning",
  cancelled: "bg-muted-foreground/40",
}

const cmsStatusLabels: Record<string, string> = {
  draft: "Draft",
  review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
}
const cmsStatusColor: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  review: "bg-warning",
  scheduled: "bg-chart-2",
  published: "bg-success",
  archived: "bg-muted-foreground/25",
}

function toRows(record: Record<string, number>, order: string[]): Array<{ key: string; value: number }> {
  return order.map((key) => ({ key, value: record[key] ?? 0 }))
}

export function AnalyticsScreen() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<(typeof trendRanges)[number]>(14)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(`/api/analytics?days=${range}`, { cache: "no-store" })
        const body = await readJson<Payload>(response)
        if (cancelled) return
        if (body.ok) setData(body.data)
        else setError(body.error.message)
      } catch {
        if (!cancelled) setError("Could not reach the Cognera server.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [range])

  if (error) {
    return <EmptyState title="Analytics are not available" description={error} />
  }
  if (!data) {
    return <EmptyState title="Loading analytics" description="Fetching counts for this organization." />
  }

  const { overview, content } = data

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="content">Content</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Leads" value={String(overview.leads.total)} note={`${overview.leads.last30Days} in the last 30 days`} />
          <Link href="/dashboard/runs">
            <StatTile
              label="Workflow runs"
              value={String(overview.workflows.totalRuns)}
              note={`${overview.workflows.activeWorkflows} active workflow${overview.workflows.activeWorkflows === 1 ? "" : "s"}`}
            />
          </Link>
          <Link href="/dashboard/ai">
            <StatTile
              label="AI runs"
              value={String(overview.ai.totalRuns)}
              note={`${overview.ai.succeeded} succeeded · ${overview.ai.failed} failed`}
            />
          </Link>
        </div>
        <TrendChart data={overview.leads.byDay} range={range} onRangeChange={setRange} />
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownChart
            title="Leads by status"
            data={toRows(overview.leads.byStatus, ["new", "contacted", "qualified", "archived"])}
            colorFor={(key) => leadStatusColor[key] ?? "bg-muted-foreground/40"}
            labelFor={(key) => leadStatusLabels[key] ?? key}
            hrefFor={(key) => `/dashboard/leads?status=${key}`}
          />
          <BreakdownChart
            title="Workflow runs by outcome"
            data={toRows(overview.workflows.byStatus, [
              "succeeded",
              "failed",
              "running",
              "queued",
              "retry_scheduled",
              "cancelled",
            ])}
            colorFor={(key) => runStatusColor[key] ?? "bg-muted-foreground/40"}
            labelFor={(key) => runStatusLabels[key] ?? key}
            hrefFor={(key) => `/dashboard/runs?status=${key}`}
          />
        </div>
      </TabsContent>
      <TabsContent value="content" className="flex flex-col gap-6 pt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownChart
            title="Pages by status"
            data={toRows(content.pages, ["draft", "review", "scheduled", "published", "archived"])}
            colorFor={(key) => cmsStatusColor[key] ?? "bg-muted-foreground/40"}
            labelFor={(key) => cmsStatusLabels[key] ?? key}
            hrefFor={(key) => `/dashboard/cms/pages?status=${key}`}
          />
          <BreakdownChart
            title="Posts by status"
            data={toRows(content.posts, ["draft", "review", "scheduled", "published", "archived"])}
            colorFor={(key) => cmsStatusColor[key] ?? "bg-muted-foreground/40"}
            labelFor={(key) => cmsStatusLabels[key] ?? key}
            hrefFor={(key) => `/dashboard/cms/posts?status=${key}`}
          />
        </div>
      </TabsContent>
    </Tabs>
  )
}
