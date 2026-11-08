import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, Lock } from "lucide-react"
import { HomeHero } from "@/components/home-hero"
import { AiDemo } from "@/components/marketing/ai-demo"
import { Faq } from "@/components/marketing/faq"
import { HowItWorks } from "@/components/marketing/how-it-works"
import { ProductTour } from "@/components/marketing/product-tour"
import { RecipeBuilder } from "@/components/marketing/recipe-builder"
import { WorksWith } from "@/components/marketing/works-with"
import { Reveal } from "@/components/scroll-reveal"
import { buttonVariants } from "@/components/ui/button"
import { brand } from "@/config/brand"

function Eyebrow({ children }: { children: string }) {
  return <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">{children}</p>
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-heading text-4xl leading-[1.05] font-bold tracking-[-0.045em] sm:text-5xl lg:text-[3.75rem]">{children}</h2>
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
      <div className="flex flex-col gap-5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <SectionTitle>{title}</SectionTitle>
      </div>
      {body ? <p className="text-lg leading-8 text-muted-foreground">{body}</p> : null}
    </div>
  )
}

export default function HomePage() {
  return (
    <>
      <HomeHero />

      <WorksWith />

      <section id="features" className="scroll-mt-24">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-24 md:px-8 md:py-28">
          <Reveal>
            <SectionHead
              eyebrow="01 · Product"
              title={
                <>
                  Everything repetitive, <span className="text-muted-foreground">in one place.</span>
                </>
              }
              body="Leads, content, automations and AI share one workspace, one team and one set of permissions. Pick an area to try it."
            />
          </Reveal>
          <Reveal delay={120}>
            <ProductTour />
          </Reveal>
        </div>
      </section>

      <section id="build" className="scroll-mt-24 border-t bg-muted/50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-24 md:px-8 md:py-28">
          <Reveal>
            <SectionHead
              eyebrow="02 · Automations"
              title="Describe it in a sentence."
              body="Choose a trigger, an AI step and what happens next, then press Test run. The same sentence becomes a workflow you can dry-run before it ever runs for real."
            />
          </Reveal>
          <Reveal delay={120}>
            <RecipeBuilder />
          </Reveal>
        </div>
      </section>

      <section id="ai" className="scroll-mt-24 border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-24 md:px-8 md:py-28">
          <Reveal>
            <SectionHead
              eyebrow="03 · AI workspace"
              title={
                <>
                  Seven skills. <span className="text-muted-foreground">Zero API keys.</span>
                </>
              }
              body="Pick a skill to see what the assistant hands back. You always get editable text — the model never sends, publishes or changes anything by itself."
            />
          </Reveal>
          <Reveal delay={120}>
            <AiDemo />
          </Reveal>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 border-t bg-muted/50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-24 md:px-8 md:py-28">
          <Reveal>
            <SectionHead eyebrow="04 · How it works" title="Live in an afternoon." />
          </Reveal>
          <Reveal delay={120}>
            <HowItWorks />
          </Reveal>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto w-full max-w-7xl px-4 py-24 md:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-14 text-ink-foreground sm:px-12">
              <div className="bg-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden="true" />
              <div className="relative grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
                <div className="flex flex-col gap-5">
                  <p className="flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-ink-foreground/60 uppercase">
                    <Lock className="size-3.5" /> Local AI by Ollama
                  </p>
                  <h2 className="font-heading text-4xl leading-[1.05] font-bold tracking-[-0.045em] sm:text-6xl">
                    Your model.
                    <br />
                    <span className="text-signal">Your machine.</span>
                  </h2>
                  <p className="max-w-xl text-lg leading-8 text-ink-foreground/65">
                    Prompts stay on hardware you control. When the model is offline you see an honest error — never a quiet switch to someone else&apos;s cloud.
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                  {[
                    ["0", "API keys"],
                    ["$0", "per token"],
                    ["100%", "on-prem"],
                  ].map(([value, label]) => (
                    <div key={label} className="bg-ink p-5">
                      <dt className="sr-only">{label}</dt>
                      <dd className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{value}</dd>
                      <dd className="mt-1 text-sm text-ink-foreground/60">{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-t">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-24 md:px-8 md:py-28 lg:grid-cols-[1fr_1.6fr]">
          <Reveal>
            <div className="flex flex-col gap-5">
              <Eyebrow>05 · FAQ</Eyebrow>
              <SectionTitle>Good questions.</SectionTitle>
              <p className="leading-7 text-muted-foreground">
                Something else?{" "}
                <Link href="/contact" className="font-medium text-foreground underline underline-offset-4">
                  Talk to us
                </Link>
                .
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Faq />
          </Reveal>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-10 px-4 py-28 md:px-8">
          <Reveal>
            <h2 className="max-w-5xl font-heading text-5xl leading-[1.02] font-bold tracking-[-0.05em] sm:text-7xl">
              {brand.tagline.split(". ").map((part, index, all) => (
                <span key={part} className={index === all.length - 1 ? "text-brand" : undefined}>
                  {part}
                  {index < all.length - 1 ? ". " : ""}
                </span>
              ))}
            </h2>
          </Reveal>
          <Reveal delay={120} className="flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={buttonVariants({ size: "xl" })}>
              Get started free <ArrowRight />
            </Link>
            <Link href="/dashboard/ai" className={buttonVariants({ size: "xl", variant: "outline" })}>
              Try the AI workspace
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  )
}
