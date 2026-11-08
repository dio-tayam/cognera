import { Bot, Cpu, Database, FileSpreadsheet, KeyRound, Mail, ShieldCheck, Sparkles, Webhook, Workflow, type LucideIcon } from "lucide-react"

const items: Array<{ name: string; note: string; icon: LucideIcon }> = [
  { name: "Ollama", note: "Local models", icon: Cpu },
  { name: "Llama 3", note: "Meta", icon: Bot },
  { name: "Qwen 2.5", note: "Alibaba", icon: Sparkles },
  { name: "PostgreSQL", note: "Row-level security", icon: Database },
  { name: "Supabase", note: "Auth", icon: ShieldCheck },
  { name: "Google", note: "Sign-in", icon: KeyRound },
  { name: "Webhooks", note: "Signed HMAC", icon: Webhook },
  { name: "Email", note: "Any HTTPS provider", icon: Mail },
  { name: "CSV", note: "Import & export", icon: FileSpreadsheet },
  { name: "Schedules", note: "Cron-style", icon: Workflow },
]

export function WorksWith() {
  const row = [...items, ...items]
  return (
    <section aria-label="Works with" className="border-y bg-card/60">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-5 md:px-8">
        <p className="hidden shrink-0 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase md:block">
          Works with
        </p>
        <div className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <ul className="animate-marquee flex w-max gap-3 group-hover:[animation-play-state:paused]">
            {row.map((item, index) => {
              const Icon = item.icon
              return (
                <li
                  key={`${item.name}-${index}`}
                  aria-hidden={index >= items.length ? true : undefined}
                  className="flex items-center gap-2.5 rounded-full border bg-background py-1.5 pr-4 pl-1.5 transition hover:border-foreground/25"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-muted">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="text-sm font-semibold">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.note}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
