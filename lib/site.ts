import "server-only"
import { z } from "zod"
import { brand } from "@/config/brand"
import { blankToUndefined } from "@/lib/env/values"

const siteSchema = z.object({
  supportEmail: z.email().nullable(),
  publicSiteUrl: z.url(),
})

export type SiteConfig = typeof brand & {
  supportEmail: string | null
  publicSiteUrl: string
}

export function getSiteConfig(): SiteConfig {
  const supportRaw = blankToUndefined(process.env.SUPPORT_EMAIL)
  const configuredUrl = blankToUndefined(process.env.PUBLIC_SITE_URL)
  // Vercel exposes the production domain without a scheme. Prefer it when the
  // public URL was omitted or accidentally left at the local development URL.
  const vercelProductionUrl = blankToUndefined(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  const vercelUrl = blankToUndefined(process.env.VERCEL_URL)
  const vercelHost = vercelProductionUrl ?? vercelUrl
  const vercelOrigin = vercelHost ? `https://${vercelHost}` : undefined
  let configuredIsLocal = false
  if (configuredUrl) {
    try {
      const hostname = new URL(configuredUrl).hostname
      configuredIsLocal = hostname === "localhost" || hostname === "127.0.0.1"
    } catch {
      // Let the schema below report invalid PUBLIC_SITE_URL consistently.
    }
  }
  const urlRaw =
    (process.env.VERCEL && configuredIsLocal ? vercelOrigin : undefined) ??
    configuredUrl ??
    vercelOrigin ??
    "http://localhost:3000"
  const parsed = siteSchema.safeParse({
    supportEmail: supportRaw ?? null,
    publicSiteUrl: urlRaw,
  })
  if (!parsed.success) {
    throw new Error(
      "SUPPORT_EMAIL or PUBLIC_SITE_URL is invalid. Expected an email and an absolute URL.",
    )
  }
  return {
    ...brand,
    supportEmail: parsed.data.supportEmail,
    publicSiteUrl: parsed.data.publicSiteUrl,
  }
}
