import type { MetadataRoute } from "next"
import { getSiteConfig } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  const site = getSiteConfig()
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login", "/signup", "/forgot-password", "/account"],
    },
    sitemap: new URL("/sitemap.xml", site.publicSiteUrl).toString(),
  }
}
