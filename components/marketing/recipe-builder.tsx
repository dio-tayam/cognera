"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  Play,
  ScanSearch,
  Tags,
  UserCheck,
  Webhook,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

type Choice = { id: string; phrase: string; step: string; icon: LucideIcon; ms: string }
type Slot = "when" | "do" | "then"

const options: Record<Slot, Choice[]> = {
  when: [
    { id: "lead", phrase: "a new lead arrives", step: "Lead created", icon: Inbox, ms: "0ms" },
    { id: "hook", phrase: "a webhook fires", step: "Signed webhook", icon: Webhook, ms: "0ms" },
    { id: "weekly", phrase: "it's Monday at 8am", step: "Weekly schedule", icon: CalendarClock, ms: "0ms" },
  ],
  do: [
    { id: "classify", phrase: "score the intent", step: "AI · Classify", icon: Tags, ms: "820ms" },
    { id: "summarize", phrase: "summarize it", step: "AI · Summarize", icon: ScanSearch, ms: "940ms" },
    { id: "reply", phrase: "draft a reply", step: "AI · Draft email", icon: Mail, ms: "1.3s" },
    { id: "outline", phrase: "outline a blog post", step: "AI · Outline", icon: FileText, ms: "2.1s" },
  ],
  then: [
    { id: "review", phrase: "ask me to review", step: "Human review", icon: UserCheck, ms: "waiting" },
    { id: "task", phrase: "create a follow-up task", step: "Follow-up task", icon: ListChecks, ms: "40ms" },
    { id: "draft", phrase: "save it as a draft", step: "Save draft", icon: ClipboardCheck, ms: "60ms" },
    { id: "notify", phrase: "notify the owner", step: "Notify owner", icon: Bell, ms: "30ms" },
  ],
}

function Blank({
  slot,
  value,
  open,
  onOpen,
  onPick,
}: {
  slot: Slot
  value: number
  open: boolean
  onOpen: (slot: Slot | null) => void
  onPick: (slot: Slot, index: number) => void
}) {
  const choice = options[slot][value] ?? options[slot][0]!
  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpen(open ? null : slot)}
        className="inline-flex items-center gap-1 rounded-xl border-2 border-dashed border-brand/40 bg-brand-soft/60 px-2 text-brand transition hover:border-brand"
      >
        {choice.phrase}
        <ChevronDown className={cn("size-5 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <ul role="listbox" className="animate-rise absolute top-full left-1/2 z-20 mt-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border bg-popover p-1.5 font-sans text-base font-normal tracking-normal shadow-[var(--elevation-3)] sm:left-0 sm:w-64 sm:translate-x-0">
          {options[slot].map((item, index) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === value}
                  onClick={() => onPick(slot, index)}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted", index === value && "bg-muted font-medium")}
                >
                  <Icon className="size-4 text-muted-foreground" /> {item.phrase}
                  {index === value ? <Check className="ml-auto size-4 text-brand" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </span>
  )
}

export function RecipeBuilder() {
  const [picked, setPicked] = useState<Record<Slot, number>>({ when: 0, do: 0, then: 0 })
  const [open, setOpen] = useState<Slot | null>(null)
  const [phase, setPhase] = useState(0)
  const timer = useRef<number | null>(null)
  const wrapper = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [])

  const pick = (slot: Slot, index: number) => {
    setPicked((value) => ({ ...value, [slot]: index }))
    setOpen(null)
    setPhase(0)
  }

  const run = () => {
    if (timer.current) window.clearInterval(timer.current)
    setPhase(1)
    timer.current = window.setInterval(() => {
      setPhase((value) => {
        if (value >= 4) {
          if (timer.current) window.clearInterval(timer.current)
          return value
        }
        return value + 1
      })
    }, 600)
  }

  const steps = (["when", "do", "then"] as const).map((slot) => options[slot][picked[slot]] ?? options[slot][0]!)
  const running = phase > 0 && phase < 4

  return (
    <div ref={wrapper} className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col justify-between gap-10 rounded-3xl border bg-card p-6 sm:p-10">
        <div className="font-heading text-[1.75rem] leading-[1.3] font-bold tracking-[-0.035em] sm:text-3xl sm:leading-[1.35] md:text-[2.6rem]">
          When <Blank slot="when" value={picked.when} open={open === "when"} onOpen={setOpen} onPick={pick} />, Cognera will{" "}
          <Blank slot="do" value={picked.do} open={open === "do"} onOpen={setOpen} onPick={pick} />, then{" "}
          <Blank slot="then" value={picked.then} open={open === "then"} onOpen={setOpen} onPick={pick} />.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <p className="text-sm text-muted-foreground">Click a highlighted phrase to change it.</p>
          <Link href="/dashboard/automations/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90">
            Build this workflow <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-6">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase">Preview</p>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Test run
          </button>
        </div>
        <ol className="relative flex flex-1 flex-col gap-3">
          <span className="absolute top-6 bottom-6 left-[1.2rem] w-px bg-border" aria-hidden="true" />
          {steps.map((step, index) => {
            const Icon = step.icon
            const done = phase > index + 1 || phase === 4
            const active = phase === index + 1
            return (
              <li key={`${index}-${step.id}`} className="relative flex items-center gap-3">
                <span
                  className={cn(
                    "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 bg-card transition",
                    done ? "border-foreground bg-foreground text-background" : active ? "border-brand text-brand" : "text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                </span>
                <span className={cn("flex flex-1 items-center justify-between rounded-2xl border px-4 py-3 transition", active && "border-brand/40 bg-brand-soft/40")}>
                  <span className="text-sm font-semibold">{step.step}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{done ? step.ms : index === 0 ? "trigger" : index === 1 ? "local AI" : "action"}</span>
                </span>
              </li>
            )
          })}
        </ol>
        <p className={cn("rounded-xl px-3 py-2 text-sm transition", phase === 4 ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
          {phase === 4 ? "Test run succeeded. Nothing was sent — this was a dry run." : "Test runs never send or publish anything."}
        </p>
      </div>
    </div>
  )
}
