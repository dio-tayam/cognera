"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  activeStatuses,
  callApi,
  formatTime,
  statusLabels,
  triggerLabels,
  type ExecutionSummary,
} from "@/components/workflows/api"
import { RunStatusBadge } from "@/components/workflows/run-status-badge"

const filters = [
  "",
  "failed",
  "retry_scheduled",
  "running",
  "queued",
  "succeeded",
  "cancelled",
] as const

/** Every execution in the organization, newest first. Failed runs are the dead-letter queue. */
export function RunsList() {
  const [status, setStatus] = useState<(typeof filters)[number]>("")
  const [runs, setRuns] = useState<ExecutionSummary[] | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await callApi<{ runs: ExecutionSummary[]; executionEnabled: boolean }>(
      `/api/workflows/runs${status ? `?status=${status}` : ""}`,
    )
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setRuns(result.data.runs)
    setEnabled(result.data.executionEnabled)
  }, [status])

  useEffect(() => {
    let cancelled = false
    void callApi<{ runs: ExecutionSummary[]; executionEnabled: boolean }>(
      `/api/workflows/runs${status ? `?status=${status}` : ""}`,
    ).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError(null)
      setRuns(result.data.runs)
      setEnabled(result.data.executionEnabled)
    })
    return () => {
      cancelled = true
    }
  }, [status])

  const anyActive = runs?.some((run) => activeStatuses.has(run.status)) ?? false
  useEffect(() => {
    if (!anyActive) return
    const timer = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(timer)
  }, [anyActive, load])

  return (
    <div className="flex flex-col gap-4">
      {!enabled ? (
        <p className="text-sm text-destructive">
          The global execution switch is off. Queued runs wait.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="run-status">Status</Label>
          <select
            id="run-status"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {filters.map((value) => (
              <option key={value} value={value}>
                {value === ""
                  ? "All runs"
                  : value === "failed"
                    ? "Failed (dead letter)"
                    : statusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : runs === null ? (
        <p className="text-sm text-muted-foreground">Loading runs.</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs match this filter.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/dashboard/runs/${run.id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <RunStatusBadge status={run.status} deadLettered={run.deadLettered} />
                <span className="font-medium">{run.workflowName}</span>
                <span className="text-muted-foreground">
                  v{run.versionNumber} · {triggerLabels[run.triggerType ?? ""] ?? run.triggerType}
                </span>
                {run.error ? <span className="truncate text-destructive">{run.error}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatTime(run.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
