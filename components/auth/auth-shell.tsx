import type { ReactNode } from "react"
import Link from "next/link"
import { Check, Mail, Tags, Workflow } from "lucide-react"
import { Logo } from "@/components/brand/logo"

const points = [
  "Leads, content and automations in one workspace",
  "Private AI on your own hardware — no API keys",
  "Roles and permissions for your whole team",
]

const activity = [
  { icon: Tags, title: "Lead #128 scored hot", meta: "AI · 0.8s", tone: "bg-signal text-signal-foreground" },
  { icon: Mail, title: "Reply drafted for Ana", meta: "Waiting for review", tone: "bg-white/10 text-ink-foreground" },
  { icon: Workflow, title: "lead-intake ran", meta: "3 of 4 steps · 1.4s", tone: "bg-white/10 text-ink-foreground" },
]

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 md:px-8 lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-[1fr_1fr] lg:items-center lg:py-12">
      <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
          <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-[-0.045em] sm:text-5xl">{title}</h1>
          <p className="leading-7 text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
        {footer ? <div className="border-t pt-6 text-sm leading-6 text-muted-foreground">{footer}</div> : null}
      </div>

      <aside className="relative hidden h-full min-h-[600px] overflow-hidden rounded-[2rem] bg-ink p-10 text-ink-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true" />
        <Link href="/" className="relative w-fit" aria-label="Cognera home">
          <Logo />
        </Link>

        <div className="relative flex flex-col gap-8">
          <p className="font-heading text-[2.6rem] leading-[1.08] font-bold tracking-[-0.045em]">
            Hand off the busywork.
            <span className="block text-signal">Keep the judgment.</span>
          </p>
          <ul className="flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-ink-foreground/75">
                <span className="grid size-5 place-items-center rounded-full bg-white/10 text-signal">
                  <Check className="size-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-col gap-2">
          <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-ink-foreground/45 uppercase">Today in your workspace</p>
          {activity.map(({ icon: Icon, title, meta, tone }, index) => (
            <div
              key={title}
              style={{ animationDelay: `${index * 120}ms` }}
              className="animate-rise flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <span className={`grid size-9 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{title}</p>
                <p className="truncate text-ink-foreground/55">{meta}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
    </div>
  )
}

const loginErrors: Record<string, string> = {
  google_unavailable: "Google sign-in is not enabled for this installation yet.",
  google_failed: "Google sign-in could not start. Try again in a moment.",
  oauth_denied: "Google sign-in was cancelled.",
  link_expired: "That link has expired or was already used. Request a new one.",
  link_invalid: "That sign-in link is not valid.",
  auth_unavailable: "Sign-in is not configured for this installation.",
}

export function authErrorMessage(code: string | string[] | undefined): string | null {
  if (typeof code !== "string") return null
  return loginErrors[code] ?? null
}
