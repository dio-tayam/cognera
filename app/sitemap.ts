import type { MetadataRoute } from "next"
import { connection } from "next/server"
import { listPublicPages, listPublicPosts } from "@/lib/cms/public"
import { getSiteConfig } from "@/lib/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  const site = getSiteConfig()
  const [pages, posts] = await Promise.all([listPublicPages(), listPublicPosts()])
  const staticPaths = [
    "/",
    "/features",
    "/integrations",
    "/security",
    "/pricing",
    "/about",
    "/blog",
    "/changelog",
    "/contact",
    "/status",
    "/privacy",
    "/terms",
    "/login",
    "/signup",
  ]
  return [
    ...staticPaths.map((path) => ({ url: new URL(path, site.publicSiteUrl).toString() })),
    ...pages.map((page) => ({
      url: new URL(`/site/${page.slug}`, site.publicSiteUrl).toString(),
      lastModified: page.updatedAt,
    })),
    ...posts.map((post) => ({
      url: new URL(`/blog/${post.slug}`, site.publicSiteUrl).toString(),
      lastModified: post.updatedAt,
    })),
  ]
}
