import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { listPublicPosts, publicContentOrganizationId } from "@/lib/cms/public"

export const metadata: Metadata = {
  title: "Blog",
  description: "Published posts.",
}

export default async function BlogIndexPage() {
  await connection()
  const configured = publicContentOrganizationId()
  const posts = configured ? await listPublicPosts() : []
  return (
    <MarketingPage narrow eyebrow="Blog" title="Blog" description={
          configured
            ? "Published posts from the public organization."
            : "Published posts will appear here when a public organization is configured."
        }>
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/blog/${post.slug}`}
              className="font-heading text-2xl font-semibold text-primary underline-offset-4 hover:underline"
            >
              {post.title}
            </Link>
            {post.excerpt ? <p className="mt-1 text-muted-foreground">{post.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    </MarketingPage>
  )
}
