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
  const urlRaw = blankToUndefined(process.env.PUBLIC_SITE_URL) ?? "http://localhost:3000"
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
