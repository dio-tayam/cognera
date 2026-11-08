import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { ContentView } from "@/components/content/content-view"
import { PageContainer } from "@/components/layout/page-container"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import NotFound from "@/app/not-found"
import { getPublicPage, publicContentOrganizationId } from "@/lib/cms/public"
import { getSiteConfig } from "@/lib/site"

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const page = await getPublicPage(slug)
  if (!page) return { title: "Not found", robots: { index: false, follow: false } }
  return publicMetadata(page, `/site/${page.slug}`)
}

export default function PublicSitePage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PublishedPage params={params} />
    </Suspense>
  )
}

async function PublishedPage({ params }: { params: Promise<Params> }) {
  await connection()
  const { slug } = await params
  if (!publicContentOrganizationId()) return <NotFound />
  const page = await getPublicPage(slug)
  if (!page) return <NotFound />
  return (
    <PageContainer size="narrow">
      <article className="flex flex-col gap-6">
        <h1 className="font-heading text-4xl font-bold">{page.title}</h1>
        {page.excerpt ? <p className="text-lg text-muted-foreground">{page.excerpt}</p> : null}
        <ContentView blocks={page.document.blocks} />
      </article>
    </PageContainer>
  )
}

function publicMetadata(
  page: {
    title: string
    slug: string
    excerpt: string | null
    seoTitle: string | null
    metaDescription: string | null
    canonicalUrl: string | null
    featuredMediaId: string | null
  },
  path: string,
): Metadata {
  const site = getSiteConfig()
  const canonical = page.canonicalUrl ?? new URL(path, site.publicSiteUrl).toString()
  const description = page.metaDescription ?? page.excerpt ?? undefined
  const title = page.seoTitle ?? page.title
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: page.featuredMediaId
        ? [new URL(`/api/media/${page.featuredMediaId}`, site.publicSiteUrl).toString()]
        : undefined,
    },
  }
}
