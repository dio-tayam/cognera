import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Content" }

const sections = [
  {
    href: "/dashboard/cms/pages" as const,
    title: "Pages",
    body: "Draft, review, schedule, and publish pages for this organization.",
  },
  {
    href: "/dashboard/cms/posts" as const,
    title: "Posts",
    body: "Draft, review, schedule, and publish posts for this organization.",
  },
  {
    href: "/dashboard/cms/media" as const,
    title: "Media",
    body: "Images stored for this organization. Preview mode does not upload.",
  },
]

export default function CmsPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Pages, posts, and media for the current organization. Preview mode keeps local fixtures and does not publish."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.href}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={section.href}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open {section.title}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
