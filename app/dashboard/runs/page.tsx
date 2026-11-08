import type { Metadata } from "next"
import { Suspense } from "react"
import { RunsScreen } from "@/components/dashboard/collection-screens"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { RunsList } from "@/components/workflows/runs-list"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Runs" }

export default function RunsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RunsContent />
    </Suspense>
  )
}

async function RunsContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Runs are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Runs"
          description="Failed and blocked rows are development fixtures. They did not execute."
        />
        <RunsScreen records={records} />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Runs"
        description="Every workflow execution in this organization, with step logs, retries, and cancellation."
      />
      <RunsList />
    </>
  )
}
