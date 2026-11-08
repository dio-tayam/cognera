"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { callApi, formatTime, triggerLabels } from "@/components/workflows/api"
import { RunStatusBadge } from "@/components/workflows/run-status-badge"

type Workflow = {
  id: string
  name: string
  status: string
  triggerType: string | null
  versionNumber: number | null
  lastRunStatus: string | null
  lastRunAt: string | null
}

type ListData = {
  workflows: Workflow[]
  executionEnabled: boolean
  permissions: { canWrite: boolean; canActivate: boolean }
}

export function WorkflowList() {
  const router = useRouter()
  const [data, setData] = useState<ListData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [template, setTemplate] = useState<"blank" | "lead_follow_up" | "lead_welcome_email">("lead_follow_up")
  const [message, setMessage] = useState("")
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    void callApi<ListData>("/api/workflows").then((result) => {
      if (cancelled) return
      if (result.ok) setData(result.data)
      else setError(result.message)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    )
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading workflows.</p>

  const visible = data.workflows.filter((workflow) =>
    workflow.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4">
      {!data.executionEnabled ? (
        <p className="text-sm text-destructive">
          The global execution switch is off. Accepted runs stay queued.
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) {
            setMessage("Enter a workflow name.")
            return
          }
          setCreating(true)
          void callApi<{ workflow: { id: string } }>("/api/workflows", {
            method: "POST",
            body: { name: name.trim(), template },
          }).then((result) => {
            setCreating(false)
            if (!result.ok) {
              setMessage(result.message)
              return
            }
            router.push(`/dashboard/automations/${result.data.workflow.id}`)
          })
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-workflow-name">New workflow</Label>
          <Input
            id="new-workflow-name"
            value={name}
            maxLength={120}
            disabled={!data.permissions.canWrite}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workflow name"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-workflow-template">Start from</Label>
          <select
            id="new-workflow-template"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={template}
            disabled={!data.permissions.canWrite}
            onChange={(event) => setTemplate(event.target.value as typeof template)}
          >
            <option value="lead_follow_up">Lead → condition → follow-up task</option>
            <option value="lead_welcome_email">Lead → send welcome email</option>
            <option value="blank">Blank (manual trigger)</option>
          </select>
        </div>
        <span
          title={
            data.permissions.canWrite ? undefined : "You need editor access to create workflows."
          }
        >
          <Button type="submit" disabled={!data.permissions.canWrite || creating}>
            {creating ? "Creating…" : "Create workflow"}
          </Button>
        </span>
      </form>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Input
        aria-label="Filter workflows"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name"
      />
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {data.workflows.length === 0 ? "No workflows yet." : "No workflow matches that filter."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((workflow) => (
            <li key={workflow.id}>
              <Link
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted"
                href={`/dashboard/automations/${workflow.id}`}
              >
                <span className="font-medium">{workflow.name}</span>
                <Badge variant={workflow.status === "active" ? "success" : "secondary"}>
                  {workflow.status === "active" ? "Active" : "Draft"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {triggerLabels[workflow.triggerType ?? ""] ?? "No trigger"}
                  {workflow.versionNumber ? ` · v${workflow.versionNumber}` : ""}
                </span>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {workflow.lastRunStatus ? (
                    <>
                      <RunStatusBadge status={workflow.lastRunStatus} />
                      {formatTime(workflow.lastRunAt)}
                    </>
                  ) : (
                    "Never run"
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
