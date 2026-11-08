"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useUnsavedChanges } from "@/components/forms/use-unsaved-changes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  activeStatuses,
  callApi,
  formatTime,
  triggerLabels,
  type ExecutionDetail,
  type ExecutionSummary,
} from "@/components/workflows/api"
import { RunDetail } from "@/components/workflows/run-detail"
import { RunStatusBadge } from "@/components/workflows/run-status-badge"
import {
  isTriggerType,
  leadSourceOptions,
  nodeCatalog,
  readinessIssues,
  triggerOf,
  validateWorkflowDefinition,
  workflowNodeTypes,
  type IntegrationStatus,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowNodeType,
} from "@/lib/workflows/definition"
import { transformModeLabels, transformModes } from "@/lib/ai/catalog"
import type { WorkflowRecord, WorkflowVersionSummary } from "@/lib/workflows/store"

type StepState = { status: string; error: string | null }
type FlowData = {
  nodeType: WorkflowNodeType
  issues: string[]
  integrations: IntegrationStatus
  step: StepState | null
}
type FlowNode = Node<FlowData, "workflow">

type Overview = {
  workflow: WorkflowRecord
  versions: WorkflowVersionSummary[]
  runs: ExecutionSummary[]
  webhook: { visible: boolean; activeSince: string | null }
  limits: { executionsPerHour: number; maxRunning: number }
  executionEnabled: boolean
  integrations: IntegrationStatus
  permissions: { canWrite: boolean; canActivate: boolean }
}

const historyLimit = 100

function newId(prefix: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`
}

function defaultNode(type: WorkflowNodeType, position: { x: number; y: number }): WorkflowNode {
  const id = newId(type.replace(/_.*/, "").slice(0, 6) + "_")
  const at = { x: Math.round(position.x), y: Math.round(position.y) }
  switch (type) {
    case "lead_created":
      return { id, type, position: at, config: { source: null } }
    case "schedule":
      return { id, type, position: at, config: { intervalMinutes: 60 } }
    case "condition":
      return {
        id,
        type,
        position: at,
        config: { path: "input.lead.email", operator: "contains", value: "@" },
      }
    case "text_transform":
      return { id, type, position: at, config: { template: "Hello {{input.lead.name}}" } }
    case "follow_up":
      return {
        id,
        type,
        position: at,
        config: { title: "Follow up with {{input.lead.name}}", body: "" },
      }
    case "send_email":
      return {
        id,
        type,
        position: at,
        config: { toPath: "input.lead.email", subject: "Thanks for reaching out", body: "" },
      }
    case "generate_text":
      return {
        id,
        type,
        position: at,
        config: { prompt: "Write a short welcome note for {{input.lead.name}}." },
      }
    case "ai_transform":
      return {
        id,
        type,
        position: at,
        config: { mode: "friendly", template: "{{input.lead.message}}" },
      }
    default:
      return { id, type, position: at, config: {} } as WorkflowNode
  }
}

function availabilityBadge(type: WorkflowNodeType, integrations: IntegrationStatus) {
  const availability = nodeCatalog[type].availability
  if (availability.kind === "built_in") return null
  const ready = type === "send_email" ? integrations.email : integrations.ai
  return ready ? (
    <Badge variant="success">Configured</Badge>
  ) : (
    <Badge variant="warning" title={availability.description}>
      Needs {availability.setting}
    </Badge>
  )
}

function WorkflowNodeView({ data, selected }: NodeProps<FlowNode>) {
  const meta = nodeCatalog[data.nodeType]
  const invalid = data.issues.length > 0
  return (
    <div
      className={`relative w-48 rounded-lg border-2 bg-card px-3 py-2 text-card-foreground shadow-sm transition-colors ${
        invalid ? "border-destructive" : selected ? "border-ring" : "border-border"
      }`}
      aria-invalid={invalid}
    >
      {isTriggerType(data.nodeType) ? null : (
        <Handle type="target" position={Position.Left} id="in" className="!size-3" />
      )}
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {meta.category}
      </p>
      <p className="text-sm font-medium">{meta.label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {availabilityBadge(data.nodeType, data.integrations)}
        {data.step ? <RunStatusBadge status={data.step.status} /> : null}
      </div>
      {data.issues[0] ? (
        <p className="mt-1 text-xs text-destructive">
          {data.issues[0]}
          {data.issues.length > 1 ? ` (+${data.issues.length - 1} more)` : ""}
        </p>
      ) : null}
      {data.nodeType === "condition" ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "35%" }}
            className="!size-3 !bg-success"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "72%" }}
            className="!size-3 !bg-destructive"
          />
          <p className="mt-1 text-right text-[10px] text-muted-foreground">yes ▲ · no ▼</p>
        </>
      ) : data.nodeType === "end" ? null : (
        <Handle type="source" position={Position.Right} id="next" className="!size-3" />
      )}
    </div>
  )
}

const nodeTypes = { workflow: WorkflowNodeView }

export function WorkflowBuilder({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <Builder workflowId={workflowId} />
    </ReactFlowProvider>
  )
}

function Builder({ workflowId }: { workflowId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [savedName, setSavedName] = useState("")
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null)
  const [savedJson, setSavedJson] = useState("")
  const [history, setHistory] = useState<WorkflowDefinition[]>([])
  const [future, setFuture] = useState<WorkflowDefinition[]>([])
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedEdges, setSelectedEdges] = useState<string[]>([])
  const [serverIssues, setServerIssues] = useState<WorkflowIssue[] | null>(null)
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [runs, setRuns] = useState<ExecutionSummary[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [runDetail, setRunDetail] = useState<ExecutionDetail | null>(null)
  const [panel, setPanel] = useState<"settings" | "runs" | "versions">("settings")
  const canvas = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView, zoomIn, zoomOut, setCenter } = useReactFlow()

  const applyOverview = useCallback((data: Overview) => {
    setOverview(data)
    setName(data.workflow.name)
    setSavedName(data.workflow.name)
    setDefinition(data.workflow.definition)
    setSavedJson(JSON.stringify(data.workflow.definition))
    setRuns(data.runs)
    setHistory([])
    setFuture([])
    setServerIssues(null)
  }, [])

  const reload = useCallback(async () => {
    const result = await callApi<Overview>(`/api/workflows/${workflowId}`)
    if (!result.ok) {
      setLoadError(result.message)
      return
    }
    setLoadError(null)
    applyOverview(result.data)
  }, [applyOverview, workflowId])

  useEffect(() => {
    let cancelled = false
    void callApi<Overview>(`/api/workflows/${workflowId}`).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadError(result.message)
        return
      }
      setLoadError(null)
      applyOverview(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [applyOverview, workflowId])

  const refreshRuns = useCallback(async () => {
    const result = await callApi<{ runs: ExecutionSummary[] }>(
      `/api/workflows/runs?workflowId=${workflowId}`,
    )
    if (result.ok) setRuns(result.data.runs.slice(0, 25))
  }, [workflowId])

  const anyActive = runs.some((run) => activeStatuses.has(run.status))
  useEffect(() => {
    if (!anyActive) return
    const timer = window.setInterval(() => void refreshRuns(), 4_000)
    return () => window.clearInterval(timer)
  }, [anyActive, refreshRuns])

  const dirty =
    definition !== null && (JSON.stringify(definition) !== savedJson || name.trim() !== savedName)
  useUnsavedChanges(dirty)

  const integrations = useMemo(
    () => overview?.integrations ?? { email: false, ai: false },
    [overview?.integrations],
  )
  const permissions = overview?.permissions ?? { canWrite: false, canActivate: false }
  const local = useMemo(
    () => (definition ? validateWorkflowDefinition(definition) : null),
    [definition],
  )
  const issues = useMemo(() => serverIssues ?? local?.issues ?? [], [serverIssues, local])
  const readiness = useMemo(
    () => (local?.definition ? readinessIssues(local.definition, integrations) : []),
    [local, integrations],
  )
  const trigger = definition ? triggerOf(definition) : undefined
  const savedDefinition = useMemo(
    () => (savedJson ? (JSON.parse(savedJson) as WorkflowDefinition) : null),
    [savedJson],
  )
  const savedTrigger = savedDefinition ? triggerOf(savedDefinition) : undefined

  /** Commits a change as one undo step. */
  const commit = useCallback((update: (current: WorkflowDefinition) => WorkflowDefinition) => {
    setDefinition((current) => {
      if (!current) return current
      const next = update(current)
      if (next === current) return current
      setHistory((past) => [...past.slice(-(historyLimit - 1)), current])
      setFuture([])
      return next
    })
    setServerIssues(null)
  }, [])

  const undo = useCallback(() => {
    setHistory((past) => {
      const previous = past.at(-1)
      if (!previous || !definition) return past
      setFuture((next) => [...next, definition])
      setDefinition(previous)
      setServerIssues(null)
      return past.slice(0, -1)
    })
  }, [definition])

  const redo = useCallback(() => {
    setFuture((next) => {
      const upcoming = next.at(-1)
      if (!upcoming || !definition) return next
      setHistory((past) => [...past, definition])
      setDefinition(upcoming)
      setServerIssues(null)
      return next.slice(0, -1)
    })
  }, [definition])

  const deleteSelection = useCallback(() => {
    if (!permissions.canWrite) return
    const nodes = new Set(selectedNodes)
    const edges = new Set(selectedEdges)
    if (nodes.size === 0 && edges.size === 0) return
    commit((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !nodes.has(node.id)),
      edges: current.edges.filter(
        (edge) => !edges.has(edge.id) && !nodes.has(edge.source) && !nodes.has(edge.target),
      ),
    }))
    setSelectedNodes([])
    setSelectedEdges([])
  }, [commit, permissions.canWrite, selectedEdges, selectedNodes])

  const stepByNode = useMemo(() => {
    const map = new Map<string, StepState>()
    if (!runDetail || runDetail.workflowId !== workflowId) return map
    for (const step of runDetail.steps)
      map.set(step.nodeId, { status: step.status, error: step.error })
    return map
  }, [runDetail, workflowId])

  const nodes: FlowNode[] = useMemo(
    () =>
      (definition?.nodes ?? []).map((node) => ({
        id: node.id,
        type: "workflow",
        position: node.position,
        selected: selectedNodes.includes(node.id),
        draggable: permissions.canWrite,
        data: {
          nodeType: node.type,
          integrations,
          step: stepByNode.get(node.id) ?? null,
          issues: [...issues, ...readiness]
            .filter((issue) => issue.nodeId === node.id)
            .map((issue) => issue.message),
        },
      })),
    [definition, selectedNodes, permissions.canWrite, integrations, stepByNode, issues, readiness],
  )

  const edges: Edge[] = useMemo(
    () =>
      (definition?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: "in",
        selected: selectedEdges.includes(edge.id),
        label:
          edge.sourceHandle === "true" ? "yes" : edge.sourceHandle === "false" ? "no" : undefined,
        animated:
          stepByNode.get(edge.source)?.status === "succeeded" && stepByNode.has(edge.target),
      })),
    [definition, selectedEdges, stepByNode],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      let selection: string[] | null = null
      const moves = new Map<string, { x: number; y: number }>()
      for (const change of changes) {
        if (change.type === "select") {
          selection ??= [...selectedNodes]
          selection = change.selected
            ? [...new Set([...selection, change.id])]
            : selection.filter((id) => id !== change.id)
        }
        if (change.type === "position" && change.position && permissions.canWrite) {
          moves.set(change.id, {
            x: Math.max(-5000, Math.min(5000, Math.round(change.position.x))),
            y: Math.max(-5000, Math.min(5000, Math.round(change.position.y))),
          })
        }
        // "remove" is handled once in onDelete so a multi-delete is one undo step.
      }
      if (selection) setSelectedNodes(selection)
      if (moves.size > 0) {
        // Drag positions stream in; the undo step was taken at drag start.
        setDefinition((current) =>
          current
            ? {
                ...current,
                nodes: current.nodes.map((node) => {
                  const moved = moves.get(node.id)
                  return moved ? { ...node, position: moved } : node
                }),
              }
            : current,
        )
      }
    },
    [permissions.canWrite, selectedNodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let selection: string[] | null = null
      for (const change of changes) {
        if (change.type === "select") {
          selection ??= [...selectedEdges]
          selection = change.selected
            ? [...new Set([...selection, change.id])]
            : selection.filter((id) => id !== change.id)
        }
      }
      if (selection) setSelectedEdges(selection)
    },
    [selectedEdges],
  )

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!definition || !connection.source || !connection.target) return false
      if (connection.source === connection.target) return false
      const target = definition.nodes.find((node) => node.id === connection.target)
      const source = definition.nodes.find((node) => node.id === connection.source)
      if (!target || !source || isTriggerType(target.type) || source.type === "end") return false
      return true
    },
    [definition],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!permissions.canWrite || !connection.source || !connection.target) return
      const handle: WorkflowEdge["sourceHandle"] =
        connection.sourceHandle === "true" || connection.sourceHandle === "false"
          ? connection.sourceHandle
          : "next"
      commit((current) => ({
        ...current,
        // Each output has one destination; connecting it again replaces the old link.
        edges: [
          ...current.edges.filter(
            (edge) => !(edge.source === connection.source && edge.sourceHandle === handle),
          ),
          {
            id: newId("e_"),
            source: connection.source,
            target: connection.target,
            sourceHandle: handle,
          },
        ],
      }))
    },
    [commit, permissions.canWrite],
  )

  const addNode = useCallback(
    (type: WorkflowNodeType, position?: { x: number; y: number }) => {
      if (!permissions.canWrite) return
      let at = position
      if (!at) {
        const rect = canvas.current?.getBoundingClientRect()
        const center = rect
          ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : { x: 0, y: 0 }
        // Offset repeated adds so new nodes do not stack exactly on top of each other.
        const offset = ((definition?.nodes.length ?? 0) % 5) * 16
        at = { x: center.x + offset, y: center.y + offset }
      }
      const node = defaultNode(type, at)
      commit((current) => ({ ...current, nodes: [...current.nodes, node] }))
      setSelectedNodes([node.id])
      setSelectedEdges([])
      setPanel("settings")
    },
    [commit, definition?.nodes.length, permissions.canWrite, screenToFlowPosition],
  )

  const focusNode = useCallback(
    (id: string) => {
      const node = definition?.nodes.find((item) => item.id === id)
      if (!node) return
      setSelectedNodes([id])
      setSelectedEdges([])
      setPanel("settings")
      void setCenter(node.position.x + 96, node.position.y + 40, { zoom: 1.2, duration: 300 })
    },
    [definition, setCenter],
  )

  const save = useCallback(async () => {
    if (!definition || !overview || !permissions.canWrite) return
    const checked = validateWorkflowDefinition(definition)
    if (checked.issues.length > 0) {
      setServerIssues(checked.issues)
      setMessage({ tone: "error", text: "Fix the highlighted nodes before saving." })
      return
    }
    setBusy("save")
    const result = await callApi<{ workflow: WorkflowRecord }>(`/api/workflows/${workflowId}`, {
      method: "PATCH",
      body: { name: name.trim(), definition, baseVersionNumber: overview.workflow.versionNumber },
    })
    setBusy(null)
    if (!result.ok) {
      if (result.issues) setServerIssues(result.issues)
      setMessage({ tone: "error", text: result.message })
      return
    }
    const workflow = result.data.workflow
    setOverview((current) => (current ? { ...current, workflow } : current))
    setSavedJson(JSON.stringify(workflow.definition))
    setSavedName(workflow.name)
    setDefinition(workflow.definition)
    setServerIssues(null)
    setMessage({ tone: "info", text: `Saved as version ${workflow.versionNumber}.` })
    const versions = await callApi<Overview>(`/api/workflows/${workflowId}`)
    if (versions.ok) setOverview(versions.data)
  }, [definition, name, overview, permissions.canWrite, workflowId])

  async function act(
    action: "activate" | "deactivate" | "test" | "run" | "rotate-webhook" | "revoke-webhook",
  ) {
    setBusy(action)
    setMessage(null)
    const result = await callApi<{
      workflow?: WorkflowRecord
      secret?: string
      revoked?: boolean
      execution?: ExecutionDetail
    }>(`/api/workflows/${workflowId}`, { method: "PATCH", body: { action } })
    setBusy(null)
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message })
      return
    }
    const data = result.data
    if (data.workflow) {
      const workflow = data.workflow
      setOverview((current) => (current ? { ...current, workflow } : current))
      setMessage({
        tone: "info",
        text:
          action === "activate"
            ? `Active. Version ${workflow.publishedVersionNumber ?? workflow.versionNumber} is published.`
            : "Deactivated. New events no longer start this workflow.",
      })
    }
    if (data.secret) {
      setSecret(data.secret)
      setMessage({
        tone: "info",
        text: "A new secret was created. The previous one stopped working.",
      })
    }
    if (action === "revoke-webhook") {
      setSecret(null)
      setMessage({
        tone: "info",
        text: data.revoked ? "The webhook secret was revoked." : "There was no active secret.",
      })
    }
    if (data.execution) {
      const execution = data.execution
      setRunDetail(execution)
      setSelectedRun(execution.id)
      setPanel("runs")
      setMessage({
        tone: execution.status === "failed" ? "error" : "info",
        text: `${action === "test" ? "Test run" : "Run"} ${execution.status.replace("_", " ")}${execution.error ? `: ${execution.error}` : "."}`,
      })
      void refreshRuns()
    }
    if (action === "rotate-webhook" || action === "revoke-webhook" || data.workflow) {
      const fresh = await callApi<Overview>(`/api/workflows/${workflowId}`)
      if (fresh.ok) setOverview(fresh.data)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.closest("input, textarea, select") || target.isContentEditable)) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
      } else if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [redo, save, undo])

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-2" role="alert">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" variant="outline" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    )
  }
  if (!definition || !overview)
    return <p className="text-sm text-muted-foreground">Loading the workflow.</p>

  const { workflow } = overview
  const active = workflow.status === "active"
  const latestPublished = active && workflow.versionStatus === "published"
  const hasIssues = (local?.issues.length ?? 0) > 0
  const reasons = {
    save: !permissions.canWrite
      ? "You need editor access to change workflows."
      : !dirty
        ? "There are no unsaved changes."
        : undefined,
    test: !permissions.canWrite
      ? "You need editor access to run tests."
      : dirty
        ? "Save first. A test runs the latest saved version."
        : !overview.executionEnabled
          ? "The global execution switch is off. The test would stay queued."
          : undefined,
    run: !permissions.canWrite
      ? "You need editor access to run workflows."
      : savedTrigger?.type !== "manual"
        ? "Run now is for workflows with a manual trigger."
        : !active
          ? "Activate the workflow first."
          : undefined,
    activate: !permissions.canActivate
      ? "Only an owner or admin can activate a workflow."
      : dirty
        ? "Save first. Activation publishes the latest saved version."
        : hasIssues
          ? "Fix the validation issues first."
          : readiness.length > 0
            ? readiness[0]?.message
            : latestPublished
              ? "The latest version is already active."
              : undefined,
    deactivate: !permissions.canActivate
      ? "Only an owner or admin can deactivate a workflow."
      : !active
        ? "The workflow is not active."
        : undefined,
    webhook: !permissions.canActivate
      ? "Only an owner or admin can manage webhook secrets."
      : savedTrigger?.type !== "webhook"
        ? "Save a workflow with a webhook trigger first."
        : undefined,
  }
  const selectedNode =
    selectedNodes.length === 1
      ? definition.nodes.find((node) => node.id === selectedNodes[0])
      : undefined
  const endpoint =
    typeof window === "undefined"
      ? `/api/public/workflows/${workflow.id}`
      : `${window.location.origin}/api/public/workflows/${workflow.id}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <Label htmlFor="workflow-name">Name</Label>
          <Input
            id="workflow-name"
            value={name}
            maxLength={120}
            disabled={!permissions.canWrite}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <Badge variant={active ? "success" : "secondary"}>{active ? "Active" : "Draft"}</Badge>
          <span className="text-muted-foreground">
            Editing v{workflow.versionNumber}
            {workflow.publishedVersionNumber
              ? ` · v${workflow.publishedVersionNumber} published`
              : " · not published"}
          </span>
          <span className={dirty ? "text-warning-foreground" : "text-muted-foreground"}>
            {busy === "save" ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>
      </div>

      {!overview.executionEnabled ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          The global execution switch is off. Accepted runs stay queued and resume when an operator
          turns it back on.
        </p>
      ) : null}
      {message ? (
        <p
          className={`text-sm ${message.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Workflow tools">
        <ToolbarButton
          label="Save"
          busy={busy === "save"}
          reason={reasons.save}
          primary
          onClick={() => void save()}
        />
        <ToolbarButton
          label="Undo"
          reason={history.length === 0 ? "Nothing to undo." : undefined}
          onClick={undo}
        />
        <ToolbarButton
          label="Redo"
          reason={future.length === 0 ? "Nothing to redo." : undefined}
          onClick={redo}
        />
        <ToolbarButton
          label="Delete selected"
          reason={
            !permissions.canWrite
              ? "You need editor access to change workflows."
              : selectedNodes.length + selectedEdges.length === 0
                ? "Select a node or connection first."
                : undefined
          }
          onClick={deleteSelection}
        />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <ToolbarButton label="Zoom in" onClick={() => void zoomIn({ duration: 150 })} />
        <ToolbarButton label="Zoom out" onClick={() => void zoomOut({ duration: 150 })} />
        <ToolbarButton
          label="Fit view"
          onClick={() => void fitView({ padding: 0.2, duration: 200 })}
        />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Test run"
          busy={busy === "test"}
          reason={reasons.test}
          onClick={() => void act("test")}
        />
        <ToolbarButton
          label="Run now"
          busy={busy === "run"}
          reason={reasons.run}
          onClick={() => void act("run")}
        />
        <ToolbarButton
          label={active && !latestPublished ? "Publish latest" : "Activate"}
          busy={busy === "activate"}
          reason={reasons.activate}
          onClick={() => void act("activate")}
        />
        <ToolbarButton
          label="Deactivate"
          busy={busy === "deactivate"}
          reason={reasons.deactivate}
          onClick={() => void act("deactivate")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <aside className="flex flex-col gap-3" aria-label="Node palette">
          <p className="text-sm text-muted-foreground">
            Drag a node onto the canvas, or press Add. Drag from a dot to connect. Select and press
            Delete to remove.
          </p>
          {(["trigger", "logic", "action", "end"] as const).map((category) => (
            <div key={category} className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {category}
              </p>
              {workflowNodeTypes
                .filter((type) => nodeCatalog[type].category === category)
                .map((type) => (
                  <div
                    key={type}
                    draggable={permissions.canWrite}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/cognera-node", type)
                      event.dataTransfer.effectAllowed = "copy"
                    }}
                    className={`flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-sm ${
                      permissions.canWrite ? "cursor-grab hover:bg-muted" : "opacity-60"
                    }`}
                    title={nodeCatalog[type].note}
                  >
                    <span className="flex flex-col">
                      <span>{nodeCatalog[type].label}</span>
                      {nodeCatalog[type].availability.kind === "external" ? (
                        <span className="text-[11px] text-muted-foreground">
                          Needs external setup
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={!permissions.canWrite}
                      aria-label={`Add ${nodeCatalog[type].label}`}
                      onClick={() => addNode(type)}
                    >
                      Add
                    </Button>
                  </div>
                ))}
            </div>
          ))}
        </aside>

        <div
          ref={canvas}
          className="h-[640px] overflow-hidden rounded-xl border border-border bg-background"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeDragStart={() => {
              if (!definition || !permissions.canWrite) return
              setHistory((past) => [...past.slice(-(historyLimit - 1)), definition])
              setFuture([])
            }}
            onBeforeDelete={async () => {
              // Apply the deletion ourselves as one undo step; React Flow only reports it.
              deleteSelection()
              return false
            }}
            onPaneClick={() => {
              setSelectedNodes([])
              setSelectedEdges([])
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = permissions.canWrite ? "copy" : "none"
            }}
            onDrop={(event) => {
              event.preventDefault()
              const type = event.dataTransfer.getData(
                "application/cognera-node",
              ) as WorkflowNodeType
              if (!workflowNodeTypes.includes(type)) return
              addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
            }}
            nodesConnectable={permissions.canWrite}
            deleteKeyCode={permissions.canWrite ? ["Backspace", "Delete"] : null}
            multiSelectionKeyCode={["Meta", "Control", "Shift"]}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-card" />
          </ReactFlow>
        </div>

        <aside className="flex flex-col gap-4">
          <section
            className="flex flex-col gap-2 rounded-xl border border-border p-3"
            aria-label="Validation summary"
          >
            <h2 className="font-heading text-base font-bold">
              Validation{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {issues.length === 0 && readiness.length === 0
                  ? "· ready"
                  : `· ${issues.length} error${issues.length === 1 ? "" : "s"}${readiness.length ? `, ${readiness.length} setup` : ""}`}
              </span>
            </h2>
            {issues.length === 0 && readiness.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No issues. This graph can be saved and activated.
              </p>
            ) : (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
                {issues.map((issue, index) => (
                  <IssueRow key={`e${index}`} issue={issue} tone="error" onFocus={focusNode} />
                ))}
                {readiness.map((issue, index) => (
                  <IssueRow key={`r${index}`} issue={issue} tone="warning" onFocus={focusNode} />
                ))}
              </ul>
            )}
          </section>

          <div className="flex gap-1" role="tablist" aria-label="Side panel">
            {(["settings", "runs", "versions"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                role="tab"
                aria-selected={panel === item}
                variant={panel === item ? "secondary" : "ghost"}
                onClick={() => setPanel(item)}
              >
                {item === "settings"
                  ? "Settings"
                  : item === "runs"
                    ? `Runs (${runs.length})`
                    : "Versions"}
              </Button>
            ))}
          </div>

          {panel === "settings" ? (
            <section className="flex flex-col gap-3" aria-label="Node settings">
              {selectedNode ? (
                <NodeSettings
                  key={selectedNode.id}
                  node={selectedNode}
                  disabled={!permissions.canWrite}
                  integrations={integrations}
                  issues={[...issues, ...readiness].filter(
                    (issue) => issue.nodeId === selectedNode.id,
                  )}
                  onChange={(config) =>
                    commit((current) => ({
                      ...current,
                      nodes: current.nodes.map((node) =>
                        node.id === selectedNode.id ? ({ ...node, config } as WorkflowNode) : node,
                      ),
                    }))
                  }
                  onDelete={deleteSelection}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {selectedNodes.length > 1
                    ? `${selectedNodes.length} nodes selected.`
                    : selectedEdges.length > 0
                      ? "A connection is selected. Press Delete or use Delete selected to remove it."
                      : "Select a node to edit its settings."}
                </p>
              )}
              {trigger?.type === "webhook" || savedTrigger?.type === "webhook" ? (
                <WebhookPanel
                  endpoint={endpoint}
                  visible={overview.webhook.visible}
                  activeSince={overview.webhook.activeSince}
                  secret={secret}
                  reason={reasons.webhook}
                  busy={busy}
                  onRotate={() => void act("rotate-webhook")}
                  onRevoke={() => void act("revoke-webhook")}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                Limits for this organization: {overview.limits.executionsPerHour} runs per hour,{" "}
                {overview.limits.maxRunning} at a time, 40 steps and 15 minutes per run, 5 automatic
                attempts.
              </p>
            </section>
          ) : null}

          {panel === "runs" ? (
            <section className="flex flex-col gap-3" aria-label="Run history">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-base font-bold">Run history</h2>
                <Button type="button" size="sm" variant="ghost" onClick={() => void refreshRuns()}>
                  Refresh
                </Button>
              </div>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No runs yet. Save, then use Test run.
                </p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm hover:bg-muted ${
                          selectedRun === run.id ? "border-ring" : "border-border"
                        }`}
                        onClick={() => {
                          setSelectedRun(run.id)
                          setRunDetail(null)
                        }}
                      >
                        <RunStatusBadge status={run.status} deadLettered={run.deadLettered} />
                        <span>{triggerLabels[run.triggerType ?? ""] ?? run.triggerType}</span>
                        <span className="text-muted-foreground">v{run.versionNumber}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatTime(run.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedRun ? (
                <div className="rounded-xl border border-border p-3">
                  <RunDetail
                    key={selectedRun}
                    executionId={selectedRun}
                    initial={runDetail?.id === selectedRun ? runDetail : undefined}
                    onChange={(execution) => {
                      setRunDetail(execution)
                      setRuns((current) =>
                        current.map((run) =>
                          run.id === execution.id ? { ...run, ...execution } : run,
                        ),
                      )
                    }}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Step results from this run are shown on the canvas nodes.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {panel === "versions" ? (
            <section className="flex flex-col gap-2" aria-label="Versions">
              <h2 className="font-heading text-base font-bold">Versions</h2>
              <p className="text-sm text-muted-foreground">
                Each save creates a version. Published versions never change; runs keep the version
                they started on.
              </p>
              <ul className="flex flex-col gap-1">
                {overview.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm"
                  >
                    <span className="font-medium">v{version.versionNumber}</span>
                    <Badge variant={version.status === "published" ? "success" : "outline"}>
                      {version.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(version.createdAt)}
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="ml-auto"
                      disabled={
                        !permissions.canWrite ||
                        JSON.stringify(version.definition) === JSON.stringify(definition)
                      }
                      title={
                        !permissions.canWrite
                          ? "You need editor access to change workflows."
                          : "Load this version into the editor. Saving creates a new version."
                      }
                      onClick={() => {
                        commit(() => version.definition)
                        setSelectedNodes([])
                        setMessage({
                          tone: "info",
                          text: `Loaded v${version.versionNumber}. Save to keep it as a new version, or Undo.`,
                        })
                      }}
                    >
                      Load
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function ToolbarButton({
  label,
  reason,
  busy,
  primary,
  onClick,
}: {
  label: string
  reason?: string
  busy?: boolean
  primary?: boolean
  onClick: () => void
}) {
  // A disabled button does not fire pointer events, so the reason sits on a wrapper.
  return (
    <span title={reason}>
      <Button
        type="button"
        size="sm"
        variant={primary ? "default" : "outline"}
        disabled={Boolean(reason) || busy}
        aria-label={reason ? `${label}. Unavailable: ${reason}` : label}
        onClick={onClick}
      >
        {busy ? `${label}…` : label}
      </Button>
    </span>
  )
}

function IssueRow({
  issue,
  tone,
  onFocus,
}: {
  issue: WorkflowIssue
  tone: "error" | "warning"
  onFocus: (id: string) => void
}) {
  const text = (
    <span className={tone === "error" ? "text-destructive" : "text-warning-foreground"}>
      {issue.message}
    </span>
  )
  return (
    <li>
      {issue.nodeId ? (
        <button
          type="button"
          className="text-left underline-offset-2 hover:underline"
          onClick={() => onFocus(issue.nodeId ?? "")}
        >
          <span className="font-mono text-xs text-muted-foreground">{issue.nodeId}</span> {text}
        </button>
      ) : (
        text
      )}
    </li>
  )
}

function WebhookPanel({
  endpoint,
  visible,
  activeSince,
  secret,
  reason,
  busy,
  onRotate,
  onRevoke,
}: {
  endpoint: string
  visible: boolean
  activeSince: string | null
  secret: string | null
  reason?: string
  busy: string | null
  onRotate: () => void
  onRevoke: () => void
}) {
  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm"
      aria-label="Webhook"
    >
      <h3 className="font-medium">Webhook endpoint</h3>
      <code className="rounded bg-muted px-2 py-1 text-xs break-all">POST {endpoint}</code>
      <p className="text-muted-foreground">
        Sign each request with header{" "}
        <code>
          x-cognera-signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256 of
          &quot;t.body&quot;&gt;
        </code>
        . Requests older than five minutes or replayed are refused. Send an{" "}
        <code>idempotency-key</code> header to make redeliveries safe. The body (a JSON object, at
        most 32 KB) is available as <code>input.webhook</code>.
      </p>
      {visible ? (
        <p>
          {activeSince
            ? `A secret is active since ${formatTime(activeSince)}.`
            : "No secret is active. Requests are refused."}
        </p>
      ) : null}
      {secret ? (
        <div className="flex flex-col gap-1 rounded-lg border border-warning/50 bg-warning/10 p-2">
          <p className="font-medium">Copy this secret now. It is not shown again.</p>
          <code className="text-xs break-all">{secret}</code>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void navigator.clipboard?.writeText(secret)}
          >
            Copy
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <span title={reason}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(reason) || busy !== null}
            onClick={onRotate}
          >
            {activeSince ? "Rotate secret" : "Create secret"}
          </Button>
        </span>
        <span title={reason ?? (activeSince ? undefined : "There is no active secret.")}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(reason) || !activeSince || busy !== null}
            onClick={onRevoke}
          >
            Revoke secret
          </Button>
        </span>
      </div>
    </section>
  )
}

function NodeSettings({
  node,
  disabled,
  integrations,
  issues,
  onChange,
  onDelete,
}: {
  node: WorkflowNode
  disabled: boolean
  integrations: IntegrationStatus
  issues: WorkflowIssue[]
  onChange: (config: WorkflowNode["config"]) => void
  onDelete: () => void
}) {
  const meta = nodeCatalog[node.type]
  const fieldIssue = (label: string) =>
    issues
      .find((issue) => issue.message.startsWith(`${label}:`))
      ?.message.slice(label.length + 1)
      .trim()
  let fields: ReactNode = <p className="text-muted-foreground">This node has no settings.</p>
  switch (node.type) {
    case "lead_created":
      fields = (
        <SelectField
          label="Only for leads from"
          value={node.config.source ?? ""}
          disabled={disabled}
          options={[
            ["", "Any source"],
            ...leadSourceOptions.map(
              (source) => [source, source.replace("_", " ")] as [string, string],
            ),
          ]}
          onChange={(value) =>
            onChange({ source: (value || null) as (typeof leadSourceOptions)[number] | null })
          }
        />
      )
      break
    case "schedule":
      fields = (
        <TextField
          label="Interval"
          suffix="minutes (5 to 1440)"
          type="number"
          value={String(node.config.intervalMinutes)}
          disabled={disabled}
          error={fieldIssue("Interval")}
          onChange={(value) => onChange({ intervalMinutes: Number.parseInt(value, 10) || 0 })}
        />
      )
      break
    case "condition":
      fields = (
        <>
          <TextField
            label="Field"
            value={node.config.path}
            disabled={disabled}
            error={fieldIssue("Field")}
            hint="For example input.lead.email, input.lead.source, input.webhook.status, or state.node_id.text."
            onChange={(path) => onChange({ ...node.config, path })}
          />
          <SelectField
            label="Operator"
            value={node.config.operator}
            disabled={disabled}
            options={[
              ["contains", "contains"],
              ["equals", "equals"],
              ["not_equals", "does not equal"],
              ["exists", "is present"],
            ]}
            onChange={(operator) =>
              onChange({ ...node.config, operator: operator as typeof node.config.operator })
            }
          />
          {node.config.operator === "exists" ? null : (
            <TextField
              label="Value"
              value={node.config.value ?? ""}
              disabled={disabled}
              error={fieldIssue("Value")}
              onChange={(value) => onChange({ ...node.config, value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Connect the green dot for yes and the red dot for no.
          </p>
        </>
      )
      break
    case "text_transform":
      fields = (
        <TextField
          label="Template"
          multiline
          value={node.config.template}
          disabled={disabled}
          error={fieldIssue("Template")}
          hint={`Later nodes can use {{state.${node.id}.text}}.`}
          onChange={(template) => onChange({ template })}
        />
      )
      break
    case "follow_up":
      fields = (
        <>
          <TextField
            label="Title"
            value={node.config.title}
            disabled={disabled}
            error={fieldIssue("Title")}
            onChange={(title) => onChange({ ...node.config, title })}
          />
          <TextField
            label="Body"
            multiline
            value={node.config.body}
            disabled={disabled}
            error={fieldIssue("Body")}
            onChange={(body) => onChange({ ...node.config, body })}
          />
        </>
      )
      break
    case "send_email":
      fields = (
        <>
          <TextField
            label="Recipient field"
            value={node.config.toPath}
            disabled={disabled}
            error={fieldIssue("Recipient field")}
            hint="A field path that holds an email address, not the address itself."
            onChange={(toPath) => onChange({ ...node.config, toPath })}
          />
          <TextField
            label="Subject"
            value={node.config.subject}
            disabled={disabled}
            error={fieldIssue("Subject")}
            onChange={(subject) => onChange({ ...node.config, subject })}
          />
          <TextField
            label="Body"
            multiline
            value={node.config.body}
            disabled={disabled}
            error={fieldIssue("Body")}
            onChange={(body) => onChange({ ...node.config, body })}
          />
        </>
      )
      break
    case "generate_text":
      fields = (
        <TextField
          label="Prompt"
          multiline
          value={node.config.prompt}
          disabled={disabled}
          error={fieldIssue("Prompt")}
          hint={`The result is available as {{state.${node.id}.text}}.`}
          onChange={(prompt) => onChange({ prompt })}
        />
      )
      break
    case "ai_transform":
      fields = (
        <>
          <SelectField
            label="Transformation"
            value={node.config.mode}
            disabled={disabled}
            options={transformModes.map((mode) => [mode, transformModeLabels[mode]])}
            onChange={(mode) =>
              onChange({ ...node.config, mode: mode as (typeof transformModes)[number] })
            }
          />
          <TextField
            label="Source text"
            multiline
            value={node.config.template}
            disabled={disabled}
            error={fieldIssue("Template")}
            hint={`Placeholders are filled, then sent as untrusted data. The result is available as {{state.${node.id}.text}}.`}
            onChange={(template) => onChange({ ...node.config, template })}
          />
        </>
      )
      break
  }
  const availability = meta.availability
  const configured =
    availability.kind === "built_in" ||
    (node.type === "send_email" ? integrations.email : integrations.ai)
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-base font-bold">{meta.label}</h2>
        <span className="font-mono text-xs text-muted-foreground">{node.id}</span>
      </div>
      <p className="text-muted-foreground">{meta.note}</p>
      {availability.kind === "external" ? (
        <p className={configured ? "text-success-foreground" : "text-warning-foreground"}>
          {configured
            ? `Configured: ${availability.setting} is set.`
            : `Requires external configuration. ${availability.description} Until ${availability.setting} is set, a test run fails at this step and the workflow cannot be activated.`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Built in. Works without external services.</p>
      )}
      {fields}
      {issues
        .filter((issue) => !/^[A-Z][A-Za-z ]+:/.test(issue.message))
        .map((issue, index) => (
          <p key={index} className="text-destructive">
            {issue.message}
          </p>
        ))}
      <Button type="button" size="sm" variant="destructive" disabled={disabled} onClick={onDelete}>
        Delete node
      </Button>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  error,
  hint,
  multiline,
  type,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  hint?: string
  multiline?: boolean
  type?: string
  suffix?: string
}) {
  const id = `field-${label.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {label}
        {suffix ? <span className="font-normal text-muted-foreground"> · {suffix}</span> : null}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = `select-${label.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}
