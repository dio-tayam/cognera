import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Cpu } from "lucide-react"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { AiDemo } from "@/components/marketing/ai-demo"
import { Badge } from "@/components/ui/badge"
import { featureCards } from "@/lib/content/marketing"

export const metadata: Metadata = { title: "Features" }

const badgeVariant = {
  Available: "success",
  Optional: "info",
  "Not connected": "warning",
} as const

export default function FeaturesPage() {
  return (
    <MarketingPage eyebrow="Features" title="Everything in one calm workspace" description="Available items work in this installation. Optional items turn on with configuration. Not connected items have a screen and do not pretend to store data.">
      <div className="grid gap-4 md:grid-cols-2">
        {featureCards.map((feature, index) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="group flex flex-col gap-4 rounded-3xl border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--elevation-2)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">0{index + 1}</span>
              <Badge variant={badgeVariant[feature.state]}>{feature.state}</Badge>
            </div>
            <h2 className="font-heading text-2xl font-bold tracking-[-0.03em]">{feature.title}</h2>
            <p className="leading-7 text-muted-foreground">{feature.body}</p>
            <span className="mt-auto flex items-center gap-1 text-sm font-medium transition-all group-hover:gap-2">
              Open {feature.title} <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
      <section className="flex flex-col gap-6 border-t pt-12">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-navy/12 text-navy">
            <Cpu className="size-5" />
          </span>
          <h2 className="font-heading text-3xl font-bold tracking-[-0.04em]">Local AI, seven operations</h2>
        </div>
        <AiDemo />
      </section>
    </MarketingPage>
  )
}
