import "server-only"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"

export type DayCount = { date: string; count: number }

export type AnalyticsOverview = {
  leads: {
    total: number
    last30Days: number
    byStatus: Record<string, number>
    byDay: DayCount[]
  }
  workflows: {
    totalRuns: number
    byStatus: Record<string, number>
    activeWorkflows: number
  }
  ai: {
    totalRuns: number
    succeeded: number
    failed: number
  }
}

export type ContentAnalytics = {
  pages: Record<string, number>
  posts: Record<string, number>
}

const leadStatuses = ["new", "contacted", "qualified", "archived"] as const
const runStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "retry_scheduled",
  "cancelled",
] as const
const cmsStatuses = ["draft", "review", "scheduled", "published", "archived"] as const

function zeroed<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
}

export async function getAnalyticsOverview(
  client: SqlClient,
  scope: { organizationId: string; userId: string },
  options: { trendDays?: number } = {},
): Promise<AnalyticsOverview> {
  const trendDays = options.trendDays ?? 14
  return withTenant(client, { tenantId: scope.organizationId, userId: scope.userId }, async (tx) => {
    const [leadTotals, leadByStatus, leadByDay, last30, runByStatus, activeWorkflows, aiTotals] =
      await Promise.all([
        tx.query<{ count: string }>("select count(*)::text as count from leads"),
        tx.query<{ status: string; count: string }>(
          "select status, count(*)::text as count from leads group by status",
        ),
        tx.query<{ day: string; count: string }>(
          `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::text as count
           from leads
           where created_at >= now() - ($1 || ' days')::interval
           group by 1 order by 1`,
          [String(trendDays - 1)],
        ),
        tx.query<{ count: string }>(
          "select count(*)::text as count from leads where created_at >= now() - interval '30 days'",
        ),
        tx.query<{ status: string; count: string }>(
          "select status, count(*)::text as count from workflow_executions group by status",
        ),
        tx.query<{ count: string }>("select count(*)::text as count from workflows where status = 'active'"),
        tx.query<{ status: string; count: string }>(
          "select status, count(*)::text as count from ai_usage_events group by status",
        ),
      ])

    const byDayMap = new Map(leadByDay.rows.map((row) => [row.day, Number(row.count)]))
    const byDay: DayCount[] = []
    for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - offset)
      const key = date.toISOString().slice(0, 10)
      byDay.push({ date: key, count: byDayMap.get(key) ?? 0 })
    }

    const aiByStatus = zeroed(["succeeded", "failed", "cancelled"] as const)
    for (const row of aiTotals.rows) {
      if (row.status in aiByStatus) aiByStatus[row.status as keyof typeof aiByStatus] = Number(row.count)
    }

    return {
      leads: {
        total: Number(leadTotals.rows[0]?.count ?? 0),
        last30Days: Number(last30.rows[0]?.count ?? 0),
        byStatus: {
          ...zeroed(leadStatuses),
          ...Object.fromEntries(leadByStatus.rows.map((row) => [row.status, Number(row.count)])),
        },
        byDay,
      },
      workflows: {
        totalRuns: runByStatus.rows.reduce((sum, row) => sum + Number(row.count), 0),
        byStatus: {
          ...zeroed(runStatuses),
          ...Object.fromEntries(runByStatus.rows.map((row) => [row.status, Number(row.count)])),
        },
        activeWorkflows: Number(activeWorkflows.rows[0]?.count ?? 0),
      },
      ai: {
        totalRuns: aiByStatus.succeeded + aiByStatus.failed + aiByStatus.cancelled,
        succeeded: aiByStatus.succeeded,
        failed: aiByStatus.failed,
      },
    }
  })
}

export async function getContentAnalytics(
  client: SqlClient,
  scope: { organizationId: string; userId: string },
): Promise<ContentAnalytics> {
  return withTenant(client, { tenantId: scope.organizationId, userId: scope.userId }, async (tx) => {
    const [pages, posts] = await Promise.all([
      tx.query<{ status: string; count: string }>(
        "select status, count(*)::text as count from cms_pages group by status",
      ),
      tx.query<{ status: string; count: string }>(
        "select status, count(*)::text as count from cms_posts group by status",
      ),
    ])
    return {
      pages: {
        ...zeroed(cmsStatuses),
        ...Object.fromEntries(pages.rows.map((row) => [row.status, Number(row.count)])),
      },
      posts: {
        ...zeroed(cmsStatuses),
        ...Object.fromEntries(posts.rows.map((row) => [row.status, Number(row.count)])),
      },
    }
  })
}
