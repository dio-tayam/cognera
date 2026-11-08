import type { Metadata } from "next"
import { Check } from "lucide-react"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { StatusNote } from "@/components/layout/status-note"
import { Button } from "@/components/ui/button"
import { billingNotice, plans } from "@/lib/content/marketing"
import { cn } from "cn"

export const metadata: Metadata = { title: "Pricing" }

const perks = [
  ["Local AI with Ollama", "Health checks", "Application shell"],
  ["Everything in Foundation", "Organizations and roles", "Shared AI usage history"],
  ["Everything in Team", "Automations and publishing", "Analytics"],
]

export default function PricingPage() {
  return (
    <MarketingPage eyebrow="Pricing" title="Simple plans. No per-token bills." description="Plans describe intended packaging. None of them can be purchased from this installation.">
      <StatusNote tone="warning">{billingNotice}</StatusNote>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === 1
          return (
            <section
              key={plan.name}
              className={cn(
                "relative flex flex-col gap-6 rounded-3xl border p-7 transition duration-300 hover:-translate-y-1",
                featured ? "border-transparent bg-foreground text-background shadow-[var(--elevation-3)]" : "bg-card",
              )}
            >
              {featured ? (
                <span className="absolute top-6 right-6 rounded-full bg-brand px-2.5 py-1 font-mono text-[10px] tracking-[0.15em] text-brand-foreground uppercase">
                  Popular
                </span>
              ) : null}
              <div className="flex flex-col gap-2">
                <h2 className="font-heading text-2xl font-bold tracking-[-0.03em]">{plan.name}</h2>
                <p className="font-heading text-4xl font-semibold tracking-[-0.04em]">{plan.price}</p>
              </div>
              <p className={cn("leading-7", featured ? "text-background/70" : "text-muted-foreground")}>{plan.detail}</p>
              <ul className="flex flex-col gap-2 text-sm">
                {perks[index]?.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <Check className={cn("size-4", featured ? "text-signal" : "text-success")} /> {perk}
                  </li>
                ))}
              </ul>
              <Button type="button" disabled size="xl" variant={featured ? "brand" : "default"} className="mt-auto">
                Choose {plan.name}
              </Button>
              <p className={cn("text-sm", featured ? "text-background/60" : "text-muted-foreground")}>{billingNotice}</p>
            </section>
          )
        })}
      </div>
    </MarketingPage>
  )
}
