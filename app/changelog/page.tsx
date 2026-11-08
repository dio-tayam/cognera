import type { Metadata } from "next"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = { title: "Changelog" }

const releases = [
  {
    version: "0.4",
    title: "Google sign-in, roles & permissions",
    tag: "Auth",
    items: [
      "Continue with Google on log-in and sign-up through Supabase Auth.",
      "One permission matrix for owner, admin, editor and member, mirrored by database policies.",
      "Email confirmation and password recovery links now complete through /auth/callback.",
      "New Roles & permissions settings page.",
    ],
  },
  {
    version: "0.3",
    title: "Private AI workspace",
    tag: "AI",
    items: [
      "Ollama provider with health checks, timeouts and cancellation.",
      "Draft email, summarize and classify leads, blog outlines, article and FAQ drafts, text transformation.",
      "AI text transformation workflow node.",
      "Organization usage history that never stores prompts.",
    ],
  },
  {
    version: "0.2",
    title: "Automations",
    tag: "Workflows",
    items: ["Visual workflow builder with triggers, conditions and actions.", "Retries, dead-letter handling and run logs.", "Signed webhooks with replay protection."],
  },
  {
    version: "0.1",
    title: "Foundation",
    tag: "Platform",
    items: ["Organizations with row-level security.", "Leads CRM and drafts-first CMS.", "System status and health checks."],
  },
]

export default function ChangelogPage() {
  return (
    <MarketingPage eyebrow="Changelog" title="What's" accent="new." description="Product updates to Cognera, newest first.">
      <ol className="relative flex flex-col gap-10 border-l pl-8">
        {releases.map((release) => (
          <li key={release.version} className="relative">
            <span className="absolute top-1.5 -left-[2.4rem] size-3.5 rounded-full border-2 border-background bg-brand-gradient ring-4 ring-brand-soft" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">v{release.version}</span>
              <Badge variant="outline">{release.tag}</Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">{release.title}</h2>
            <ul className="mt-3 flex max-w-2xl list-disc flex-col gap-1.5 pl-5 leading-7 text-muted-foreground">
              {release.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </MarketingPage>
  )
}
