import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

const suggestions = [
  { href: "/features", label: "Product overview" },
  { href: "/dashboard", label: "Open the application" },
  { href: "/integrations", label: "Integrations" },
  { href: "/contact", label: "Contact us" },
] as const

export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(60%_70%_at_50%_30%,black,transparent)]" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-start gap-8 px-4 py-24 md:px-8">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">Error 404</p>
        <h1 className="font-heading text-6xl leading-[0.95] font-bold tracking-[-0.06em] sm:text-8xl">
          This step <span className="text-brand">doesn&apos;t exist.</span>
        </h1>
        <p className="max-w-lg text-lg leading-8 text-muted-foreground">That address is not part of Cognera AI. It may have moved, or the link was mistyped.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className={buttonVariants({ size: "xl" })}>
            <ArrowLeft /> Back to home
          </Link>
          <Link href="/features" className={buttonVariants({ size: "xl", variant: "outline" })}>
            View features
          </Link>
        </div>
        <ul className="grid w-full gap-2 border-t pt-8 sm:grid-cols-2">
          {suggestions.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="group flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition hover:border-foreground/30">
                {item.label} <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
