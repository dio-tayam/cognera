import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { ContentView } from "@/components/content/content-view"
import { PageContainer } from "@/components/layout/page-container"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import NotFound from "@/app/not-found"
import { getPublicPost, publicContentOrganizationId } from "@/lib/cms/public"
import { getSiteConfig } from "@/lib/site"

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const post = await getPublicPost(slug)
  if (!post) return { title: "Not found", robots: { index: false, follow: false } }
  const site = getSiteConfig()
  const canonical =
    post.canonicalUrl ?? new URL(`/blog/${post.slug}`, site.publicSiteUrl).toString()
  const description = post.metaDescription ?? post.excerpt ?? undefined
  const title = post.seoTitle ?? post.title
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: post.featuredMediaId
        ? [new URL(`/api/media/${post.featuredMediaId}`, site.publicSiteUrl).toString()]
        : undefined,
    },
  }
}

export default function BlogPostPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PublishedPost params={params} />
    </Suspense>
  )
}

async function PublishedPost({ params }: { params: Promise<Params> }) {
  await connection()
  const { slug } = await params
  if (!publicContentOrganizationId()) return <NotFound />
  const post = await getPublicPost(slug)
  if (!post) return <NotFound />
  return (
    <PageContainer size="narrow">
      <article className="flex flex-col gap-6">
        <h1 className="font-heading text-4xl font-bold">{post.title}</h1>
        {post.excerpt ? <p className="text-lg text-muted-foreground">{post.excerpt}</p> : null}
        <ContentView blocks={post.document.blocks} />
      </article>
    </PageContainer>
  )
}
