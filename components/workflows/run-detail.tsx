"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  activeStatuses,
  callApi,
  formatTime,
  triggerLabels,
  type ExecutionDetail,
} from "@/components/workflows/api"
import { RunStatusBadge } from "@/components/workflows/run-status-badge"
import { nodeCatalog, type WorkflowNodeType } from "@/lib/workflows/definition"

/**
 * Step-by-step view of one execution, with cancel and retry.
 * While the run is active it refreshes every few seconds. The refresh only
 * reads state; execution happens in the worker, not in this browser.
 */
export function RunDetail({
  executionId,
  onChange,
  initial,
}: {
  executionId: string
  onChange?: (execution: ExecutionDetail) => void
  initial?: ExecutionDetail
}) {
  const [execution, setExecution] = useState<ExecutionDetail | null>(initial ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"cancel" | "retry" | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await callApi<{ execution: ExecutionDetail }>(
      `/api/workflows/runs/${executionId}`,
    )
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setExecution(result.data.execution)
    onChange?.(result.data.execution)
  }, [executionId, onChange])

  // Callers remount this component (key) when the run changes, so this runs once per run.
  useEffect(() => {
    if (initial?.id === executionId) return
    let cancelled = false
    void callApi<{ execution: ExecutionDetail }>(`/api/workflows/runs/${executionId}`).then(
      (result) => {
        if (cancelled) return
        if (!result.ok) {
          setError(result.message)
          return
        }
        setExecution(result.data.execution)
        onChange?.(result.data.execution)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per mounted run
  }, [executionId])

  const active = execution ? activeStatuses.has(execution.status) : false
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => void load(), 3_000)
    return () => window.clearInterval(timer)
  }, [active, load])

  async function act(action: "cancel" | "retry") {
    setBusy(action)
    setNotice(null)
    const result = await callApi<{ status: string; execution: ExecutionDetail }>(
      `/api/workflows/runs/${executionId}`,
      { method: "POST", body: { action } },
    )
    setBusy(null)
    if (!result.ok) {
      setNotice(result.message)
      return
    }
    setExecution(result.data.execution)
    onChange?.(result.data.execution)
    setNotice(
      action === "cancel"
        ? result.data.status === "cancel_requested"
          ? "Cancellation requested. The worker stops before the next step."
          : "The run was cancelled."
        : "The run was resumed from the step that failed.",
    )
  }

  if (error && !execution) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    )
  }
  if (!execution) return <p className="text-sm text-muted-foreground">Loading the run.</p>

  const cancelReason = execution.canCancel
    ? undefined
    : execution.cancelRequested
      ? "Cancellation is already requested."
      : activeStatuses.has(execution.status)
        ? "You need editor access to cancel runs."
        : "Only queued, running, or retrying runs can be cancelled."
  const retryReason = execution.canRetry
    ? undefined
    : execution.status !== "failed"
      ? "Only a failed run can be retried."
      : execution.manualRetryCount >= 3
        ? "This run was already retried three times."
        : "Activate the workflow, or ask an editor, to retry this run."

  return (
    <div className="flex flex-col gap-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={execution.status} deadLettered={execution.deadLettered} />
        <span className="text-muted-foreground">
          {triggerLabels[execution.triggerType ?? ""] ?? execution.triggerType ?? "Unknown trigger"}{" "}
          · {execution.workflowName} v{execution.versionNumber}
        </span>
        <span className="ml-auto flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!execution.canCancel || busy !== null}
            title={cancelReason}
            onClick={() => void act("cancel")}
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!execution.canRetry || busy !== null}
            title={retryReason}
            onClick={() => void act("retry")}
          >
            {busy === "retry" ? "Retrying…" : "Retry"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
            Refresh
          </Button>
        </span>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {execution.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
          {execution.error}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Run id</dt>
        <dd className="font-mono text-xs break-all">{execution.id}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatTime(execution.createdAt)}</dd>
        <dt className="text-muted-foreground">Finished</dt>
        <dd>{formatTime(execution.finishedAt)}</dd>
        <dt className="text-muted-foreground">Attempts</dt>
        <dd>
          {execution.attemptCount}
          {execution.job
            ? ` (job ${execution.job.status}, ${execution.job.attempts} of ${execution.job.maxAttempts})`
            : ""}
          {execution.manualRetryCount > 0
            ? ` · retried by hand ${execution.manualRetryCount}×`
            : ""}
        </dd>
        {execution.nextRetryAt ? (
          <>
            <dt className="text-muted-foreground">Next retry</dt>
            <dd>{formatTime(execution.nextRetryAt)}</dd>
          </>
        ) : null}
      </dl>
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Steps</h3>
        {execution.steps.length === 0 ? (
          <p className="text-muted-foreground">
            {activeStatuses.has(execution.status)
              ? "No step has run yet. A worker picks the job up when execution is enabled."
              : "No steps were recorded."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {execution.steps.map((step) => (
              <li
                key={`${step.nodeId}-${step.attempt}-${step.startedAt}`}
                className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={step.status} />
                  <span className="font-medium">
                    {step.nodeType
                      ? nodeCatalog[step.nodeType as WorkflowNodeType]?.label
                      : "Removed node"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{step.nodeId}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    attempt {step.attempt}
                    {step.durationMs !== null ? ` · ${step.durationMs} ms` : ""}
                  </span>
                </div>
                {step.error ? <p className="text-destructive">{step.error}</p> : null}
                {step.output !== null && step.output !== undefined ? (
                  <pre className="overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
      {execution.tasks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Follow-up tasks created</h3>
          <ul className="flex flex-col gap-1">
            {execution.tasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium">{task.title}</p>
                {task.body ? <p className="text-muted-foreground">{task.body}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details>
        <summary className="cursor-pointer text-muted-foreground">Input and output</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
          {JSON.stringify({ input: execution.input, output: execution.output }, null, 2)}
        </pre>
      </details>
    </div>
  )
}
