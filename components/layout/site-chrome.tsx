"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export function SiteChrome({
  tagline,
  supportEmail,
  children,
}: {
  tagline: string
  supportEmail: string | null
  children: ReactNode
}) {
  const pathname = usePathname()
  if (pathname.startsWith("/dashboard")) {
    return <div className="flex min-h-full flex-1 flex-col">{children}</div>
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <main id="content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter tagline={tagline} supportEmail={supportEmail} />
    </div>
  )
}
