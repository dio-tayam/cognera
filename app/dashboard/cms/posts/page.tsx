import type { Metadata } from "next"
import { Suspense } from "react"
import { DocumentsScreen } from "@/components/dashboard/collection-screens"
import { CmsEditor } from "@/components/dashboard/cms-editor"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Posts" }

export default function CmsPostsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PostsContent />
    </Suspense>
  )
}

async function PostsContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Posts are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Posts"
          description="Drafts can be validated. They are not saved or published."
        />
        <DocumentsScreen records={records} kind="post" />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Posts"
        description="Drafts stay in this organization. A post is public only after it is published."
      />
      <CmsEditor kind="post" />
    </>
  )
}
