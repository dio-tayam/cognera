import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getContentAnalytics } from "@/lib/analytics/report"
import { requireCrmContext } from "@/lib/crm/context"

export const metadata: Metadata = { title: "Content" }

export default function CmsPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Pages, posts, and media for the current organization. Preview mode keeps local fixtures and does not publish."
      />
      <Suspense fallback={<PageSkeleton />}>
        <ContentSections />
      </Suspense>
    </>
  )
}

async function ContentSections() {
  await connection()
  const access = await requireCrmContext()
  const counts = access.ok
    ? await getContentAnalytics(access.context.database, access.context).catch(() => null)
    : null

  const sections = [
    {
      href: "/dashboard/cms/pages" as const,
      title: "Pages",
      body: "Draft, review, schedule, and publish pages for this organization.",
      published: counts?.pages.published,
      draft: counts?.pages.draft,
    },
    {
      href: "/dashboard/cms/posts" as const,
      title: "Posts",
      body: "Draft, review, schedule, and publish posts for this organization.",
      published: counts?.posts.published,
      draft: counts?.posts.draft,
    },
    {
      href: "/dashboard/cms/media" as const,
      title: "Media",
      body: "Images stored for this organization. Preview mode does not upload.",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {sections.map((section) => (
        <Link key={section.href} href={section.href} className="group block">
          <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-brand/30 group-hover:shadow-[var(--elevation-2)]">
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="group-hover:text-brand">{section.title}</CardTitle>
                <CardDescription>{section.body}</CardDescription>
              </div>
            </CardHeader>
            {section.published !== undefined ? (
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="success">{section.published} published</Badge>
                <Badge variant="outline">{section.draft} draft{section.draft === 1 ? "" : "s"}</Badge>
              </CardContent>
            ) : null}
          </Card>
        </Link>
      ))}
    </div>
  )
}
