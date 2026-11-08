import type { Metadata } from "next"
import Link from "next/link"
import { Bot, Database, Fingerprint, Gauge, Globe, KeyRound, Lock, ShieldCheck } from "lucide-react"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { RolesMatrix } from "@/components/marketing/roles-matrix"

export const metadata: Metadata = { title: "Security" }

const controls = [
  { icon: Database, title: "Tenant isolation", body: "Every organization's rows are protected by Postgres row-level security, checked for each query." },
  { icon: KeyRound, title: "Roles & permissions", body: "Owner, admin, editor and member, enforced in the app and again by the database." },
  { icon: Fingerprint, title: "Sign-in", body: "Supabase Auth with Google or email. Sessions live in httpOnly cookies; the service key never reaches the browser." },
  { icon: Gauge, title: "Rate limits", body: "Login, sign-up, exports, workflow runs and AI generation are rate limited, failing closed." },
  { icon: Globe, title: "Safe outbound calls", body: "Workflow HTTP calls are checked against SSRF: private, loopback and redirected addresses are refused." },
  { icon: Bot, title: "AI guardrails", body: "Untrusted text is fenced from instructions, secrets are redacted, output is sanitized, and actions are allowlisted." },
  { icon: Lock, title: "Private AI", body: "Models run on your hardware through Ollama. Prompts are never stored in usage records." },
  { icon: ShieldCheck, title: "Signed webhooks", body: "HMAC signatures with timestamps and nonce replay protection for inbound automation triggers." },
]

export default function SecurityPage() {
  return (
    <MarketingPage
      eyebrow="Security"
      title="Automation you can"
      accent="trust."
      description="Cognera assumes every input is untrusted — including what an AI model says. Access is decided by deterministic server code, never by a model."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {controls.map(({ icon: Icon, title, body }) => (
          <article key={title} className="flex flex-col gap-3 rounded-3xl border bg-card p-6 transition hover:-translate-y-1 hover:shadow-[var(--elevation-2)]">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Icon className="size-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>
      <section className="flex flex-col gap-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-[-0.04em]">Permission matrix</h2>
          <p className="leading-7 text-muted-foreground">Select a role to highlight what it can do.</p>
        </div>
        <RolesMatrix />
      </section>
      <section className="rounded-3xl border bg-card p-8">
        <h2 className="text-2xl font-bold tracking-tight">A note on prompt injection</h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          No prompt-injection defense is perfect. That is why AI output in Cognera is only ever editable text for a person to review, and why publishing, sending and permission changes always pass server-side role checks. Found an issue?{" "}
          <Link href="/contact" className="font-medium text-foreground underline underline-offset-4">
            Tell us
          </Link>
          .
        </p>
      </section>
    </MarketingPage>
  )
}
