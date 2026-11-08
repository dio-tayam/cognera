import type { Metadata } from "next"
import { Suspense } from "react"
import { AutomationsScreen } from "@/components/dashboard/collection-screens"
import { WorkflowList } from "@/components/workflows/workflow-list"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Automations" }

export default function AutomationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AutomationsContent />
    </Suspense>
  )
}

async function AutomationsContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Automations are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Automations"
          description="These drafts are development fixtures. The run control stays disabled."
        />
        <AutomationsScreen records={records} />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Automations"
        description="Workflows are saved for this organization. A workflow runs only after it is activated."
      />
      <WorkflowList />
    </>
  )
}
