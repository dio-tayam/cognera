import type { Metadata } from "next"
import { Suspense } from "react"
import { MediaLibrary } from "@/components/dashboard/media-library"
import { MediaScreen } from "@/components/dashboard/media-screen"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Media" }

export default function MediaPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MediaContent />
    </Suspense>
  )
}

async function MediaContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Media is unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Media"
          description="Choosing a file reports that it was not uploaded. Fixture filenames are not files on disk."
        />
        <MediaScreen records={records} />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Media"
        description="Uploads stay in this organization. A file is public only when published content uses it."
      />
      <MediaLibrary />
    </>
  )
}
