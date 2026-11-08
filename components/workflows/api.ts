import type { WorkflowIssue } from "@/lib/workflows/definition"
import type { ExecutionDetail, ExecutionSummary } from "@/lib/workflows/store"

export type { ExecutionDetail, ExecutionSummary }

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; code: string; issues?: WorkflowIssue[] }

/** Fetches a Cognera JSON endpoint and normalizes success and error bodies. */
export async function callApi<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    })
  } catch {
    return {
      ok: false,
      status: 0,
      code: "network",
      message: "The request did not reach the server. Check your connection.",
    }
  }
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error?: { code?: string; message?: string }; issues?: WorkflowIssue[] }
    | null
  if (response.ok && body && body.ok) return { ok: true, data: body.data }
  const failed = body && !body.ok ? body : null
  return {
    ok: false,
    status: response.status,
    code: failed?.error?.code ?? "error",
    message: failed?.error?.message ?? `The request failed with HTTP ${response.status}.`,
    issues: failed?.issues,
  }
}

export const activeStatuses = new Set(["queued", "running", "retry_scheduled"])

export const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  retry_scheduled: "Retry scheduled",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
}

export const triggerLabels: Record<string, string> = {
  test: "Test run",
  manual: "Manual",
  lead_created: "Lead created",
  webhook: "Webhook",
  schedule: "Schedule",
}

export function formatTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
}
