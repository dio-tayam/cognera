"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, Menu } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { isNavActive } from "@/lib/navigation"
import { cn } from "cn"

const primary = [
  { href: "/features", label: "Product" },
  { href: "/#ai", label: "AI" },
  { href: "/integrations", label: "Integrations" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
] as const

const secondary = [
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/changelog", label: "Changelog" },
  { href: "/contact", label: "Contact" },
  { href: "/status", label: "System status" },
] as const

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,border-color] duration-300",
        scrolled ? "border-b bg-background/80 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
        <div className="flex items-center gap-10">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} aria-label="Cognera home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
            {primary.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isNavActive(pathname, link.href) ? "page" : undefined}
                className="relative text-[15px] text-foreground/75 transition hover:text-foreground after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-brand-gradient after:transition hover:after:scale-x-100 aria-[current=page]:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="hidden text-[15px] text-foreground/80 transition hover:text-foreground sm:inline"
            aria-current={pathname === "/login" ? "page" : undefined}
          >
            Sign in
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "hidden h-11 rounded-xl px-5 text-[15px] sm:inline-flex")}>
            Get started <ArrowRight />
          </Link>
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="lg:hidden"
              render={<Button type="button" variant="outline" size="icon" aria-label="Open menu" />}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[...primary, ...secondary, { href: "/login", label: "Sign in" }, { href: "/signup", label: "Get started" }].map(
                  (link) => (
                    <SheetClose
                      key={link.href}
                      render={
                        <Link
                          href={link.href}
                          className="rounded-xl px-3 py-2.5 text-lg font-semibold tracking-tight hover:bg-muted"
                        />
                      }
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </SheetClose>
                  ),
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
