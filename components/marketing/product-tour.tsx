"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, BarChart3, Check, Cpu, FileText, Lock, ShieldCheck, Users, Workflow, type LucideIcon } from "lucide-react"
import { cn } from "cn"

type Tab = { id: string; title: string; body: string; href: string; icon: LucideIcon }

const tabs: Tab[] = [
  { id: "auto", title: "Automations", body: "Triggers, conditions and AI steps on a canvas, with retries and a log for every run.", href: "/dashboard/automations", icon: Workflow },
  { id: "ai", title: "AI workspace", body: "Draft, summarize, classify and rewrite with Ollama. Every result is editable.", href: "/dashboard/ai", icon: Cpu },
  { id: "leads", title: "Leads CRM", body: "Every inquiry in one pipeline — status, notes, activity and CSV export.", href: "/dashboard/leads", icon: Users },
  { id: "cms", title: "Content", body: "Pages and posts stay drafts until someone with publish rights ships them.", href: "/dashboard/cms", icon: FileText },
  { id: "analytics", title: "Analytics", body: "Pipeline, workflow and AI usage, computed from your own records only.", href: "/dashboard/analytics", icon: BarChart3 },
  { id: "security", title: "Security", body: "Four roles enforced in the app and again by Postgres row-level security.", href: "/security", icon: ShieldCheck },
]

export function ProductTour() {
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => setActive((value) => (value + 1) % tabs.length), 6000)
    return () => window.clearInterval(id)
  }, [auto])

  const tab = tabs[active] ?? tabs[0]!

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
      <ul className="flex flex-col" role="tablist" aria-label="Product areas" aria-orientation="vertical">
        {tabs.map((item, index) => {
          const Icon = item.icon
          const selected = index === active
          return (
            <li key={item.id} className="border-b last:border-b-0">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setActive(index)
                  setAuto(false)
                }}
                className="relative flex w-full items-start gap-4 py-4 text-left"
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border transition", selected ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground")}>
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={cn("font-heading text-xl font-bold tracking-[-0.03em] transition", selected ? "text-foreground" : "text-muted-foreground")}>{item.title}</span>
                  <span className={cn("grid transition-[grid-template-rows] duration-300", selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <span className="overflow-hidden text-sm leading-6 text-muted-foreground">{item.body}</span>
                  </span>
                </span>
                {selected && auto ? <span key={active} className="animate-grow absolute inset-x-0 -bottom-px h-px origin-left bg-foreground" style={{ animationDuration: "6s" }} /> : null}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col overflow-hidden rounded-3xl border bg-card shadow-[var(--elevation-2)]">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase">{tab.title}</span>
          <Link href={tab.href} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            Open <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div key={tab.id} className="animate-rise min-h-[340px] flex-1 p-5 sm:p-6">
          {tab.id === "auto" ? <AutomationPreview /> : null}
          {tab.id === "ai" ? <AiPreview /> : null}
          {tab.id === "leads" ? <LeadsPreview /> : null}
          {tab.id === "cms" ? <CmsPreview /> : null}
          {tab.id === "analytics" ? <AnalyticsPreview /> : null}
          {tab.id === "security" ? <SecurityPreview /> : null}
        </div>
      </div>
    </div>
  )
}

function AutomationPreview() {
  const [on, setOn] = useState(true)
  const steps = ["Lead created", "Classify intent", "Draft reply", "Review"]
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="font-heading text-lg font-bold tracking-tight">lead-intake</p>
        <button type="button" role="switch" aria-checked={on} onClick={() => setOn(!on)} className="flex items-center gap-2 text-sm">
          <span className={cn("relative h-5 w-9 rounded-full transition", on ? "bg-success" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-4.5" : "left-0.5")} />
          </span>
          {on ? "Active" : "Paused"}
        </button>
      </div>
      <ol className="bg-dots grid flex-1 grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <span className={cn("font-mono text-[10px] uppercase", index === 1 || index === 2 ? "text-brand" : "text-muted-foreground")}>
              {index === 0 ? "Trigger" : index === 3 ? "Human" : "AI"}
            </span>
            <span className="text-sm font-semibold">{step}</span>
            <span className={cn("mt-auto h-1 rounded-full", on ? "bg-foreground" : "bg-muted")} />
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">{on ? "Runs on every new lead. Last run: succeeded in 1.4s." : "Paused — new leads wait until you resume."}</p>
    </div>
  )
}

function AiPreview() {
  const ops = ["Summarize", "Classify", "Draft email", "Rewrite"]
  const outputs = [
    "Clinic group (3 sites) wants automated follow-ups. Flexible budget, starting this month.",
    "hot · 92% — clear budget signal and a start date.",
    "Hi Ana, thanks for reaching out — could we find 20 minutes this week?",
    "Thank you for your message. We'd be glad to help with your automation needs.",
  ]
  const [op, setOp] = useState(0)
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {ops.map((name, index) => (
          <button key={name} type="button" onClick={() => setOp(index)} className={cn("rounded-full border px-3 py-1.5 text-sm transition", op === index ? "border-foreground bg-foreground text-background" : "hover:border-foreground/30")}>
            {name}
          </button>
        ))}
      </div>
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">“We run three clinics in Cebu and want appointment follow-ups automated…”</p>
      <div key={op} className="animate-rise flex-1 rounded-2xl border p-4">
        <p className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">Output · editable</p>
        <p className="mt-2 leading-7">{outputs[op]}</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" /> llama3.2 on this machine · prompts are not stored
      </p>
    </div>
  )
}

function LeadsPreview() {
  const statuses = ["new", "contacted", "qualified"] as const
  const [rows, setRows] = useState([
    { name: "Ana Reyes", company: "Bloom Clinics", status: 2 },
    { name: "Marco Cruz", company: "Tala Foods", status: 1 },
    { name: "Jess Lim", company: "Northwind", status: 0 },
    { name: "Paolo Santos", company: "Lumen Studio", status: 0 },
  ])
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-sm text-muted-foreground">Click a status to move a lead along.</p>
      <ul className="divide-y rounded-2xl border">
        {rows.map((row, index) => (
          <li key={row.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">
                {row.name.split(" ").map((part) => part[0]).join("")}
              </span>
              <span>
                <span className="block text-sm font-semibold">{row.name}</span>
                <span className="block text-xs text-muted-foreground">{row.company}</span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setRows((current) => current.map((item, i) => (i === index ? { ...item, status: (item.status + 1) % statuses.length } : item)))}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[11px] uppercase transition",
                row.status === 2 ? "bg-success/15 text-success" : row.status === 1 ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground",
              )}
            >
              {statuses[row.status]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CmsPreview() {
  const [published, setPublished] = useState(false)
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("rounded-full px-2.5 py-1 font-mono text-[11px] uppercase", published ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
          {published ? "Published" : "Draft · rev 3"}
        </span>
        <button type="button" onClick={() => setPublished(!published)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background">
          {published ? "Unpublish" : "Publish"}
        </button>
      </div>
      <div className="flex-1 rounded-2xl border p-5">
        <p className="font-heading text-2xl font-bold tracking-tight">Five follow-up emails you can automate today</p>
        <div className="mt-4 flex flex-col gap-2">
          <span className="h-2 w-full rounded bg-muted" />
          <span className="h-2 w-11/12 rounded bg-muted" />
          <span className="h-2 w-4/5 rounded bg-muted" />
          <span className="h-2 w-2/3 rounded bg-muted" />
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Publishing needs the admin or owner role.
      </p>
    </div>
  )
}

function AnalyticsPreview() {
  const data = [
    { label: "Mon", value: 12 },
    { label: "Tue", value: 19 },
    { label: "Wed", value: 15 },
    { label: "Thu", value: 26 },
    { label: "Fri", value: 22 },
    { label: "Sat", value: 9 },
    { label: "Sun", value: 7 },
  ]
  const [hover, setHover] = useState(3)
  const max = Math.max(...data.map((item) => item.value))
  const current = data[hover] ?? data[0]!
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Workflow runs · sample week</p>
        <p className="font-heading text-4xl font-bold tracking-tight">
          {current.value} <span className="text-base font-medium text-muted-foreground">on {current.label}</span>
        </p>
      </div>
      <div className="flex flex-1 items-end gap-2 border-b pb-2">
        {data.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-label={`${item.label}: ${item.value}`}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <span className={cn("w-full rounded-t-md transition-all duration-300", index === hover ? "bg-brand" : "bg-muted-foreground/20")} style={{ height: `${(item.value / max) * 100}%` }} />
            <span className="font-mono text-[10px] text-muted-foreground">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SecurityPreview() {
  const roles = [
    { role: "Owner", can: ["Everything", "Delete organization"] },
    { role: "Admin", can: ["Publish", "Activate workflows", "Manage team"] },
    { role: "Editor", can: ["Edit leads", "Write drafts", "Build workflows"] },
    { role: "Member", can: ["View workspace", "Use AI"] },
  ]
  const [open, setOpen] = useState(2)
  return (
    <ul className="flex flex-col gap-2">
      {roles.map((item, index) => (
        <li key={item.role}>
          <button type="button" onClick={() => setOpen(index)} aria-expanded={open === index} className={cn("w-full rounded-2xl border px-4 py-3 text-left transition", open === index ? "border-foreground/30 bg-background" : "hover:bg-muted/50")}>
            <span className="flex items-center justify-between">
              <span className="font-semibold">{item.role}</span>
              <ShieldCheck className={cn("size-4", open === index ? "text-brand" : "text-muted-foreground")} />
            </span>
            {open === index ? (
              <span className="animate-rise mt-2 flex flex-wrap gap-2">
                {item.can.map((permission) => (
                  <span key={permission} className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs text-success">
                    <Check className="size-3" /> {permission}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
