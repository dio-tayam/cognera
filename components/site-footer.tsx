import Link from "next/link"
import { Logo } from "@/components/brand/logo"

const columns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/integrations", label: "Integrations" },
      { href: "/pricing", label: "Pricing" },
      { href: "/dashboard/ai", label: "AI workspace" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
      { href: "/status", label: "System status" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const

export function SiteFooter({ tagline, supportEmail }: { tagline: string; supportEmail: string | null }) {
  return (
    <footer className="relative overflow-hidden border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 pt-16 pb-10 md:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="max-w-xs leading-7 text-muted-foreground">{tagline}</p>
            {supportEmail ? (
              <a className="w-fit font-medium underline-offset-4 hover:underline" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Support contact is not configured.</p>
            )}
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">{column.title}</p>
              {column.links.map((link) => (
                <Link key={link.href} href={link.href} className="w-fit text-foreground/80 transition hover:text-brand">
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© Cognera AI · AI automation for growing teams</p>
          <p className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal" /> Local AI by Ollama · no paid inference required</p>
        </div>
      </div>
      <p
        aria-hidden="true"
        className="text-gradient pointer-events-none translate-y-[0.1em] pb-[0.08em] text-center text-[22vw] leading-none font-semibold tracking-[-0.07em] opacity-[0.09] select-none"
      >
        cognera
      </p>
    </footer>
  )
}
