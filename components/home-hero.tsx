import Link from "next/link"
import { ArrowDown, ArrowRight, Check } from "lucide-react"
import { GoogleIcon } from "@/components/auth/google-button"
import { RotatingWord } from "@/components/marketing/rotating-word"
import { TriageMockup } from "@/components/marketing/triage-mockup"
import { buttonVariants } from "@/components/ui/button"

const checks = ["No API keys", "Runs on your hardware", "Roles & permissions"]

export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 px-4 pt-14 pb-24 md:px-8 lg:grid-cols-[1fr_1.12fr] lg:pt-20 lg:pb-32">
        <div className="animate-rise flex min-w-0 flex-col items-start gap-8">
          <p className="inline-flex items-center gap-2.5 rounded-full border bg-card py-1.5 pr-4 pl-1.5 text-sm shadow-[var(--elevation-1)]">
            <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] tracking-wider text-background uppercase">AI</span>
            Now automating <RotatingWord words={["lead triage", "email replies", "blog drafts", "FAQ updates"]} />
          </p>
          <h1 className="font-heading text-[clamp(2.75rem,5.6vw,4.9rem)] leading-[1.06] font-bold tracking-[-0.045em]">
            Automate the busywork.
            <span className="mt-1 block text-brand">Keep the judgment.</span>
          </h1>
          <p className="max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
            Cognera triages leads, runs your workflows and drafts content with a private AI model on your own machine — and
            waits for a person before anything is sent or published.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <a href="/auth/google?next=/dashboard" className={buttonVariants({ size: "xl" })}>
              <GoogleIcon /> Continue with Google
            </a>
            <Link href="#how" className={buttonVariants({ size: "xl", variant: "outline" })}>
              See how it works <ArrowDown />
            </Link>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {checks.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" /> {item}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href="/signup" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
              Get started free <ArrowRight className="size-3.5" />
            </Link>
            <Link href="/dashboard" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Open the application
            </Link>
            <Link href="/status" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              View system status
            </Link>
            <Link href="/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Log in
            </Link>
          </p>
        </div>
        <div className="min-w-0 lg:pl-4">
          <TriageMockup />
        </div>
      </div>
    </section>
  )
}
