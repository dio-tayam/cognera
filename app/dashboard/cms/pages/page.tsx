import type { Metadata } from "next"
import { Suspense } from "react"
import { DocumentsScreen } from "@/components/dashboard/collection-screens"
import { CmsEditor } from "@/components/dashboard/cms-editor"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Pages" }

export default function CmsPagesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PagesContent />
    </Suspense>
  )
}

async function PagesContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Pages are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Pages"
          description="Drafts can be validated. They are not saved or published."
        />
        <DocumentsScreen records={records} kind="page" />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Pages"
        description="Drafts stay in this organization. A page is public only after it is published."
      />
      <CmsEditor kind="page" />
    </>
  )
}
