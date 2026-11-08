"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Cpu, Inbox, UserCheck } from "lucide-react"
import { cn } from "cn"

const steps = [
  {
    title: "Connect an AI model",
    body: "Use local Ollama or connect to Ollama Cloud. Cognera never downloads local models without asking.",
    icon: Cpu,
    lines: ["$ npm run ai:check", "pass: Ollama answers at 127.0.0.1:11434", "Suggested: llama3.2 (about 2.0 GB)", "$ ollama pull llama3.2"],
  },
  {
    title: "Bring in leads and content",
    body: "Your contact form feeds a real CRM. Pages and posts live in a drafts-first CMS with revisions, media and roles.",
    icon: Inbox,
    lines: ["POST /api/public/contact", "→ lead created  · source: contact_form", "→ workflow lead.follow-up queued", "→ owner notified in dashboard"],
  },
  {
    title: "Automate with a human in the loop",
    body: "Workflows classify, summarize and draft. People approve. Publishing, sending and permission changes always pass server-side checks.",
    icon: UserCheck,
    lines: ["trigger  lead_created", "ai       classify → hot", "ai       transform → friendly reply", "task     review & send   ✓ awaiting you"],
  },
]

export function HowItWorks() {
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => setActive((value) => (value + 1) % steps.length), 5000)
    return () => window.clearInterval(id)
  }, [auto])

  const step = steps[active] ?? steps[0]!

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <ol className="flex flex-col gap-3">
        {steps.map((item, index) => {
          const Icon = item.icon
          const selected = active === index
          return (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => {
                  setActive(index)
                  setAuto(false)
                }}
                aria-pressed={selected}
                className={cn(
                  "relative flex w-full gap-4 overflow-hidden rounded-2xl border p-5 text-left transition",
                  selected ? "border-brand/30 bg-card shadow-[var(--elevation-2)]" : "hover:bg-card/70",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl transition",
                    selected ? "bg-brand-gradient text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Step {index + 1}</span>
                  <span className="text-xl font-semibold tracking-tight">{item.title}</span>
                  <span className="leading-7 text-muted-foreground">{item.body}</span>
                </span>
                {selected && auto ? <span key={active} className="animate-grow absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand-gradient" /> : null}
              </button>
            </li>
          )
        })}
      </ol>
      <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-ink-foreground shadow-[var(--elevation-3)]">
        <div className="relative mb-5 flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-[0.2em] text-ink-foreground/50 uppercase">
            Step {active + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(step.lines.join("\n")).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              })
            }}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-ink-foreground/80 transition hover:bg-white/10"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div key={active} className="relative flex min-h-36 flex-col gap-2 font-mono text-sm">
          {step.lines.map((line, index) => (
            <p
              key={line}
              className={cn("animate-rise", line.startsWith("$") ? "text-signal" : "text-ink-foreground/75")}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="relative mt-8 flex gap-2">
          {steps.map((_, index) => (
            <span key={index} className={cn("h-1 flex-1 rounded-full transition", index <= active ? "bg-signal" : "bg-white/10")} />
          ))}
        </div>
      </div>
    </div>
  )
}
