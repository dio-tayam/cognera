"use client"

import { useEffect, useState } from "react"
import { FileText, ListTree, Mail, MessagesSquare, Repeat2, ScanSearch, Tags } from "lucide-react"
import { cn } from "cn"

const samples = [
  {
    id: "email",
    label: "Draft email",
    icon: Mail,
    input: "Hi! We run three clinics in Cebu and want to automate appointment follow-ups…",
    output:
      "Subject: Automating follow-ups for your clinics\n\nHi Ana,\n\nThanks for reaching out — automating follow-ups across three clinics is exactly what Cognera does well. Could we find 20 minutes this week to map your current process? [Add two time slots]\n\nBest,\n[Your name]",
  },
  {
    id: "classify",
    label: "Classify lead",
    icon: Tags,
    input: "We're ready to sign this quarter. 120 seats, need SSO and on-prem AI…",
    output:
      "Suggested label: hot (92% confidence)\n\nClear budget, seat count and a timeline this quarter.\n\nThis is a suggestion. The lead's status is unchanged until someone updates it.",
  },
  {
    id: "summary",
    label: "Summarize",
    icon: ScanSearch,
    input: "Hello, I'm Marco from Tala Foods. We have 40 franchise stores and our marketing team…",
    output:
      "Marco (Tala Foods, 40 franchise stores) wants automated social post drafts and routing of catering inquiries to branches. Requests a demo before month end. Constraint: data must stay on their servers.",
  },
  {
    id: "outline",
    label: "Blog outline",
    icon: ListTree,
    input: "Topic: Why small businesses should run AI on their own hardware",
    output:
      "# Your AI, your hardware\n\n## The hidden cost of per-token pricing\n- Unpredictable bills\n\n## What “local” really means\n- Data never leaves the building\n\n## Picking a model for your machine\n- 8 GB RAM → 3B model",
  },
  {
    id: "faq",
    label: "FAQ draft",
    icon: MessagesSquare,
    input: "Cognera runs AI on your own machine through Ollama. No API key or card is needed…",
    output:
      "**Do I need an API key?**\n\nNo. Cognera talks to Ollama on your machine, so there is no key and no per-token bill.\n\n**Is anything published automatically?**\n\nNo. Content stays a draft until an editor publishes it.",
  },
  {
    id: "transform",
    label: "Transform",
    icon: Repeat2,
    input: "hey so we got ur message and we can def help with the automations thing, lmk…",
    output:
      "Thank you for your message. We would be glad to help with your automation needs. Please let us know a convenient time to talk.",
  },
  {
    id: "article",
    label: "Article",
    icon: FileText,
    input: "Topic: Five follow-up emails you can automate today",
    output:
      "# Five follow-up emails you can automate today\n\nMost deals are lost in the quiet days after a first call. Here are five messages that keep momentum without adding work…",
  },
]

export function AiDemo() {
  const [index, setIndex] = useState(0)
  const [shown, setShown] = useState(0)
  const sample = samples[index] ?? samples[0]!

  useEffect(() => {
    const id = window.setInterval(() => {
      setShown((value) => {
        if (value >= sample.output.length) {
          window.clearInterval(id)
          return value
        }
        return value + 3
      })
    }, 16)
    return () => window.clearInterval(id)
  }, [sample.output])

  const typing = shown < sample.output.length

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <div className="flex flex-wrap content-start gap-2 lg:flex-col lg:flex-nowrap">
        {samples.map((item, itemIndex) => {
          const Icon = item.icon
          const selected = itemIndex === index
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIndex(itemIndex)
                setShown(0)
              }}
              aria-pressed={selected}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                selected
                  ? "border-transparent bg-foreground text-background shadow-[var(--elevation-2)]"
                  : "bg-card hover:-translate-y-0.5 hover:shadow-[var(--elevation-1)]",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg transition",
                  selected ? "bg-brand text-brand-foreground" : "bg-muted text-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
      <div className="overflow-hidden rounded-3xl border bg-card shadow-[var(--elevation-2)]">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-warning/60" />
            <span className="size-2.5 rounded-full bg-success/60" />
          </div>
          <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-success" /> ollama · llama3.2 · local
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Input · untrusted</p>
            <p className="mt-1 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">{sample.input}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Sample output · editable
            </p>
            <pre className="mt-1 min-h-56 font-sans text-sm leading-6 whitespace-pre-wrap">
              {sample.output.slice(0, shown)}
              {typing ? <span className="animate-caret ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 bg-brand" /> : null}
            </pre>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            <span className="rounded-full border px-2.5 py-1">Copy</span>
            <span className="rounded-full border px-2.5 py-1">Edit</span>
            <span className="rounded-full border px-2.5 py-1">Regenerate</span>
            <span className="ml-auto">Nothing is sent or published by the model.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
