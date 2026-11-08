"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  FileText,
  ListTree,
  Loader2,
  Mail,
  MessagesSquare,
  Pencil,
  RefreshCw,
  Repeat2,
  ScanSearch,
  Square,
  Tags,
  Wand2,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  aiOperations,
  describeWarning,
  type AiOperationId,
  type AiRunResult,
  type AiUsageSummary,
} from "@/lib/ai/catalog"
import type { AiHealth } from "@/lib/ai/types"
import { cn } from "cn"

type HealthPayload = { health: AiHealth; suggestion: { model: string; download: string; reason: string }; mode: string }
type ApiError = { code: string; message: string; hint?: string | null }

const icons: Record<AiOperationId, LucideIcon> = {
  draft_email: Mail,
  lead_summary: ScanSearch,
  lead_classify: Tags,
  blog_outline: ListTree,
  article_draft: FileText,
  faq_draft: MessagesSquare,
  transform_text: Repeat2,
}

const labelTone: Record<string, string> = {
  hot: "bg-brand text-brand-foreground",
  warm: "bg-warning/20 text-warning-foreground",
  cold: "bg-info/15 text-info-foreground",
  support: "bg-teal/15 text-teal",
  spam: "bg-destructive/15 text-destructive",
}

async function readJson<T>(response: Response): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: ApiError }
    | null
  if (!body) return { ok: false, error: { code: "bad_response", message: `The server answered ${response.status}.` } }
  return body
}

function defaults(id: AiOperationId): Record<string, string> {
  const meta = aiOperations.find((operation) => operation.id === id)!
  return Object.fromEntries(
    meta.fields.map((field) => [field.name, field.kind === "select" ? (field.options?.[0]?.[0] ?? "") : ""]),
  )
}

export function AiWorkspace() {
  const [operation, setOperation] = useState<AiOperationId>("draft_email")
  const [values, setValues] = useState<Record<AiOperationId, Record<string, string>>>(
    () => Object.fromEntries(aiOperations.map((meta) => [meta.id, defaults(meta.id)])) as Record<AiOperationId, Record<string, string>>,
  )
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AiRunResult | null>(null)
  const [draft, setDraft] = useState("")
  const [view, setView] = useState<"preview" | "edit">("preview")
  const [error, setError] = useState<ApiError | null>(null)
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [usage, setUsage] = useState<AiUsageSummary | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const [lastRun, setLastRun] = useState<{ operation: AiOperationId; input: Record<string, string> } | null>(null)

  const meta = aiOperations.find((item) => item.id === operation)!
  const edited = result !== null && draft !== result.text

  const checkHealth = useCallback(async () => {
    setChecking(true)
    setHealthError(null)
    try {
      const response = await fetch("/api/ai/health", { cache: "no-store" })
      const body = await readJson<HealthPayload>(response)
      if (body.ok) setHealth(body.data)
      else setHealthError(body.error.message)
    } catch {
      setHealthError("Could not reach the Cognera server.")
    } finally {
      setChecking(false)
    }
  }, [])

  const loadUsage = useCallback(async () => {
    try {
      const body = await readJson<AiUsageSummary>(await fetch("/api/ai/usage", { cache: "no-store" }))
      if (body.ok) setUsage(body.data)
    } catch {
      // Usage history is optional; the workspace still works without it.
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void checkHealth()
      void loadUsage()
    }, 0)
    return () => window.clearTimeout(id)
  }, [checkHealth, loadUsage])

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const id = window.setInterval(() => setElapsed(Date.now() - started), 100)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => () => controller.current?.abort(), [])

  async function run(target: { operation: AiOperationId; input: Record<string, string> }) {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setLastRun(target)
    setElapsed(0)
    setRunning(true)
    setError(null)
    try {
      const response = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target),
        signal: abort.signal,
      })
      const body = await readJson<{ result: AiRunResult }>(response)
      if (body.ok) {
        setResult(body.data.result)
        setDraft(body.data.result.text)
        setView("preview")
      } else {
        setError(body.error)
      }
    } catch {
      if (abort.signal.aborted) setError({ code: "cancelled", message: "Generation cancelled. Nothing was saved." })
      else setError({ code: "network", message: "Could not reach the Cognera server." })
    } finally {
      if (controller.current === abort) controller.current = null
      setRunning(false)
      void loadUsage()
      if (!abort.signal.aborted) void checkHealth()
    }
  }

  const status = health?.health.status
  const ready = status === "ready"
  const missingRequired = meta.fields.some((field) => field.required && !values[operation][field.name]?.trim())

  const statusTone = useMemo(() => {
    if (healthError) return "bg-destructive"
    if (!health) return "bg-muted-foreground"
    return status === "ready" ? "bg-success" : status === "model_missing" ? "bg-warning" : "bg-destructive"
  }, [health, healthError, status])

  return (
    <div className="flex flex-col gap-6">
      {/* Connection */}
      <section
        aria-label="AI connection"
        className={cn(
          "flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between",
          health && !ready && "border-warning/40",
        )}
      >
        <div className="flex gap-3">
          <span className="relative mt-1.5 flex size-2.5">
            {ready ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" /> : null}
            <span className={cn("relative inline-flex size-2.5 rounded-full", statusTone)} />
          </span>
          <div className="flex flex-col gap-1" role="status" aria-live="polite">
            <p className="font-medium">
              {healthError
                ? "AI status unavailable"
                : !health
                  ? "Checking Ollama…"
                  : status === "ready"
                    ? `Connected to Ollama · ${health.health.model}`
                    : status === "model_missing"
                      ? "Ollama is running, model missing"
                      : status === "unreachable"
                        ? "Ollama is unreachable"
                        : "Ollama is not configured"}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">{healthError ?? health?.health.message}</p>
            {health?.health.hint ? <p className="text-sm leading-6">{health.health.hint}</p> : null}
            {health && !ready ? (
              <p className="text-sm text-muted-foreground">
                Suggested for this server: <span className="font-mono">{health.suggestion.model}</span> ({health.suggestion.download}).
                Cognera never downloads models or falls back to a paid provider.
              </p>
            ) : null}
            {health?.health.installedModels.length ? (
              <p className="flex flex-wrap gap-1 pt-1">
                {health.health.installedModels.map((name) => (
                  <span key={name} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {name}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {health?.health.latencyMs != null ? (
            <span className="font-mono text-xs text-muted-foreground">{health.health.latencyMs} ms</span>
          ) : null}
          {health?.mode === "preview" ? <Badge variant="outline">Preview</Badge> : null}
          <Button type="button" variant="outline" onClick={() => void checkHealth()} disabled={checking}>
            <RefreshCw className={cn(checking && "animate-spin")} /> Check connection
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Input */}
        <section aria-label="Prompt" className="flex flex-col gap-5 rounded-3xl border bg-card p-5">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Operation</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4" role="radiogroup" aria-label="Operation">
              {aiOperations.map((item) => {
                const Icon = icons[item.id]
                const selected = item.id === operation
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={running}
                    onClick={() => setOperation(item.id)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-2xl border p-3 text-left text-sm transition disabled:opacity-60",
                      selected
                        ? "border-transparent bg-foreground text-background shadow-[var(--elevation-2)]"
                        : "hover:-translate-y-0.5 hover:bg-muted/60",
                    )}
                  >
                    <Icon className={cn("size-4", selected ? "text-signal dark:text-brand" : "text-muted-foreground")} />
                    <span className="font-medium leading-tight">{item.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!running && ready && !missingRequired) void run({ operation, input: values[operation] })
            }}
          >
            {meta.fields.map((field) => {
              const id = `ai-${operation}-${field.name}`
              const value = values[operation][field.name] ?? ""
              const set = (next: string) =>
                setValues((current) => ({ ...current, [operation]: { ...current[operation], [field.name]: next } }))
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>
                    {field.label}
                    {field.required ? <span className="text-brand"> *</span> : null}
                  </Label>
                  {field.kind === "textarea" ? (
                    <Textarea id={id} rows={6} value={value} placeholder={field.placeholder} maxLength={8000} disabled={running} onChange={(event) => set(event.target.value)} />
                  ) : field.kind === "select" ? (
                    <select
                      id={id}
                      value={value}
                      disabled={running}
                      onChange={(event) => set(event.target.value)}
                      className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                      {field.options?.map(([optionValue, text]) => (
                        <option key={optionValue} value={optionValue}>
                          {text}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={id}
                      type={field.kind === "number" ? "number" : "text"}
                      min={field.kind === "number" ? 3 : undefined}
                      max={field.kind === "number" ? 10 : undefined}
                      value={value}
                      placeholder={field.placeholder}
                      disabled={running}
                      onChange={(event) => set(event.target.value)}
                    />
                  )}
                  {field.kind === "textarea" ? (
                    <p className="text-right font-mono text-[11px] text-muted-foreground">{value.length.toLocaleString()} / 8,000</p>
                  ) : null}
                </div>
              )
            })}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {running ? (
                <Button type="button" size="xl" variant="outline" onClick={() => controller.current?.abort()}>
                  <Square className="fill-current" /> Cancel
                </Button>
              ) : (
                <Button type="submit" size="xl" disabled={!ready || missingRequired}>
                  <Wand2 /> Generate
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={running}
                onClick={() => setValues((current) => ({ ...current, [operation]: { ...meta.example } }))}
              >
                Fill example
              </Button>
              {!ready && health ? (
                <span className="text-sm text-muted-foreground">Generation needs a ready Ollama connection.</span>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Text you enter is treated as untrusted data and kept separate from the assistant&apos;s instructions. Credentials and card numbers are
              removed before it reaches the model. Prompts are not stored.
            </p>
          </form>
        </section>

        {/* Output */}
        <section aria-label="Output" className="flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="Output view">
              {(
                [
                  ["preview", "Preview", Eye],
                  ["edit", "Edit", Pencil],
                ] as const
              ).map(([key, text, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  disabled={!result}
                  onClick={() => setView(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
                    view === key ? "bg-card shadow-[var(--elevation-1)]" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" /> {text}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                disabled={!result || running}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(draft)
                    .then(() => toast.success("Copied to clipboard"))
                    .catch(() => toast.error("Copy failed. Select the text and copy it manually."))
                }}
              >
                <Copy /> Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!lastRun || running || !ready}
                onClick={() => lastRun && void run(lastRun)}
              >
                <RefreshCw /> Regenerate
              </Button>
            </div>
          </div>

          <div className="relative flex flex-1 flex-col p-5">
            {running ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" role="status">
                <Loader2 className="size-6 animate-spin text-brand" />
                <p className="font-medium">Generating with {health?.health.model ?? "the local model"}…</p>
                <p className="font-mono text-sm text-muted-foreground">{(elapsed / 1000).toFixed(1)}s</p>
                <p className="max-w-xs text-sm text-muted-foreground">Local models can take a while on CPU. Cancel stops the request on the server too.</p>
              </div>
            ) : error ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="size-4" /> {error.message}
                </p>
                {error.hint ? <p className="text-sm leading-6">{error.hint}</p> : null}
                <p className="font-mono text-xs text-muted-foreground">code: {error.code}</p>
              </div>
            ) : null}

            {!running && result ? (
              <div className={cn("flex flex-1 flex-col gap-4", error && "mt-4 opacity-60")}>
                {view === "edit" ? (
                  <Textarea
                    aria-label="Edit output"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-80 flex-1 font-mono text-sm leading-6"
                  />
                ) : (
                  <OutputPreview result={result} draft={draft} edited={edited} />
                )}
                {result.warnings.length ? (
                  <ul className="flex flex-col gap-1 rounded-2xl bg-warning/10 p-3 text-sm text-warning-foreground">
                    {result.warnings.map((code) => (
                      <li key={code} className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {describeWarning(code)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 font-mono text-[11px] text-muted-foreground">
                  <span>{result.model}</span>
                  <span>{(result.durationMs / 1000).toFixed(1)}s</span>
                  {result.completionTokens != null ? <span>{result.completionTokens} tokens out</span> : null}
                  {edited ? <span className="text-brand">edited</span> : null}
                  <span className="ml-auto font-sans">Review before using. Nothing was sent or published.</span>
                </div>
              </div>
            ) : null}

            {!running && !result && !error ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Wand2 className="size-6" />
                <p>Output appears here, ready to edit and copy.</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <UsageHistory usage={usage} />
    </div>
  )
}

function OutputPreview({ result, draft, edited }: { result: AiRunResult; draft: string; edited: boolean }) {
  const structured = result.structured
  if (edited || structured.kind === "text") {
    return <div className="flex-1 text-[15px] leading-7 whitespace-pre-wrap">{draft}</div>
  }
  if (structured.kind === "email") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Subject: </span>
          <span className="font-semibold">{structured.subject}</span>
        </p>
        <div className="text-[15px] leading-7 whitespace-pre-wrap">{structured.body}</div>
      </div>
    )
  }
  if (structured.kind === "classification") {
    const percent = Math.round(structured.confidence * 100)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 font-heading text-lg font-bold capitalize", labelTone[structured.label])}>
            {structured.label}
          </span>
          <span className="text-sm text-muted-foreground">{percent}% confidence</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="leading-7">{structured.reason}</p>
        <p className="text-sm text-muted-foreground">A suggestion only. The lead&apos;s status stays unchanged until someone updates it.</p>
      </div>
    )
  }
  if (structured.kind === "outline") {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="font-heading text-2xl font-bold tracking-tight">{structured.title}</h3>
        <ol className="flex flex-col gap-3">
          {structured.sections.map((section, index) => (
            <li key={`${section.heading}-${index}`} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-brand font-mono text-[11px] text-brand">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{section.heading}</p>
                <ul className="mt-1 list-disc pl-4 text-sm leading-6 text-muted-foreground">
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  return (
    <dl className="flex flex-col gap-3">
      {structured.items.map((item, index) => (
        <div key={`${item.question}-${index}`} className="rounded-2xl border p-4">
          <dt className="font-semibold">{item.question}</dt>
          <dd className="mt-1 leading-7 text-muted-foreground">{item.answer}</dd>
        </div>
      ))}
    </dl>
  )
}

function UsageHistory({ usage }: { usage: AiUsageSummary | null }) {
  const label = (id: string) => aiOperations.find((item) => item.id === id)?.label ?? id
  return (
    <section aria-label="Usage history" className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Usage history</h2>
          <p className="text-sm text-muted-foreground">
            Sizes, timings and outcomes for your organization. Prompts and outputs are not stored.
            {usage?.storage === "memory" ? " Preview mode keeps history in server memory only." : ""}
          </p>
        </div>
        {usage ? (
          <dl className="flex gap-6 text-sm">
            {[
              ["Runs (30d)", usage.totals.runs],
              ["Succeeded", usage.totals.succeeded],
              ["Failed", usage.totals.failed],
              ["Tokens out", usage.totals.completionTokens.toLocaleString()],
            ].map(([name, value]) => (
              <div key={name}>
                <dt className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">{name}</dt>
                <dd className="font-heading text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {!usage ? (
        <p className="text-sm text-muted-foreground">Usage history is unavailable.</p>
      ) : usage.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI runs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                <th className="py-2 pr-4 font-normal">When</th>
                <th className="py-2 pr-4 font-normal">Operation</th>
                <th className="py-2 pr-4 font-normal">Model</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 text-right font-normal">Duration</th>
                <th className="py-2 text-right font-normal">Output</th>
              </tr>
            </thead>
            <tbody>
              {usage.rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">{label(row.operation)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.model}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={row.status === "succeeded" ? "success" : row.status === "cancelled" ? "outline" : "destructive"}>
                      {row.status === "succeeded" ? <Check /> : null}
                      {row.status}
                      {row.errorCode ? ` · ${row.errorCode}` : ""}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-xs">{(row.durationMs / 1000).toFixed(1)}s</td>
                  <td className="py-2 text-right font-mono text-xs">{row.outputChars.toLocaleString()} chars</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
