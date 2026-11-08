import type { ReactNode } from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Instrument_Sans, Inter_Tight, JetBrains_Mono } from "next/font/google"
import { connection } from "next/server"
import { SiteChrome } from "@/components/layout/site-chrome"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { brand } from "@/config/brand"
import { getSiteConfig } from "@/lib/site"
import "./globals.css"

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
})

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.tagline,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${instrumentSans.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <Suspense
            fallback={
              <p className="px-4 py-6 text-sm text-muted-foreground">Loading site details.</p>
            }
          >
            <Frame>{children}</Frame>
          </Suspense>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

async function Frame({ children }: { children: ReactNode }) {
  await connection()
  const site = getSiteConfig()
  return (
    <SiteChrome tagline={site.tagline} supportEmail={site.supportEmail}>
      {children}
    </SiteChrome>
  )
}
