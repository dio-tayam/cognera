import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Cpu, Database, FileSpreadsheet, KeyRound, Mail, ShieldCheck, Webhook, type LucideIcon } from "lucide-react"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

export const metadata: Metadata = { title: "Integrations" }

const integrations: Array<{
  name: string
  category: string
  body: string
  setting: string
  icon: LucideIcon
  tone: string
}> = [
  { name: "Ollama", category: "AI", body: "Local models for drafting, summarizing, classifying and transforming text. No API key.", setting: "OLLAMA_BASE_URL", icon: Cpu, tone: "bg-brand-gradient text-white" },
  { name: "Google sign-in", category: "Auth", body: "One-click sign-up and log-in through Supabase Auth's Google provider.", setting: "Supabase → Providers → Google", icon: KeyRound, tone: "bg-card text-foreground border" },
  { name: "Supabase Auth", category: "Auth", body: "Email and password accounts, confirmation and recovery links, session cookies.", setting: "SUPABASE_URL", icon: ShieldCheck, tone: "bg-success/15 text-success" },
  { name: "PostgreSQL", category: "Data", body: "Tenant data with row-level security, the workflow job queue and AI usage ledger.", setting: "DATABASE_URL", icon: Database, tone: "bg-navy/15 text-navy" },
  { name: "Signed webhooks", category: "Automation", body: "Start workflows from any system with HMAC-signed requests and replay protection.", setting: "Per workflow", icon: Webhook, tone: "bg-plum/15 text-plum" },
  { name: "Email provider", category: "Automation", body: "Workflow email steps post to your HTTPS provider endpoint with idempotency keys.", setting: "EMAIL_WEBHOOK_URL", icon: Mail, tone: "bg-teal/15 text-teal" },
  { name: "CSV export", category: "Data", body: "Export filtered leads for spreadsheets and other CRMs. Admins and owners only.", setting: "Built in", icon: FileSpreadsheet, tone: "bg-warning/15 text-warning-foreground" },
]

const categories = ["All", ...new Set(integrations.map((item) => item.category))]

export default function IntegrationsPage() {
  return (
    <MarketingPage
      eyebrow="Integrations"
      title="Plugs into the tools"
      accent="you already run."
      description="Every integration is opt-in and configured by your operator. Missing settings show an honest status instead of pretending to work."
      actions={
        <Link href="/dashboard/integrations" className={buttonVariants({ size: "xl" })}>
          Check your connections <ArrowRight />
        </Link>
      }
    >
      <p className="sr-only">Categories: {categories.join(", ")}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((item) => {
          const Icon = item.icon
          return (
            <article
              key={item.name}
              className="group flex flex-col gap-4 rounded-3xl border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-[var(--elevation-2)]"
            >
              <div className="flex items-center justify-between">
                <span className={cn("grid size-12 place-items-center rounded-2xl", item.tone)}>
                  <Icon className="size-5" />
                </span>
                <Badge variant="outline">{item.category}</Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight">{item.name}</h2>
              <p className="leading-7 text-muted-foreground">{item.body}</p>
              <p className="mt-auto rounded-xl bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{item.setting}</p>
            </article>
          )
        })}
      </div>
    </MarketingPage>
  )
}
