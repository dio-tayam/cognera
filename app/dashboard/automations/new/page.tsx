import type { Metadata } from "next"
import { Suspense } from "react"
import { AutomationForm } from "@/components/dashboard/automation-form"
import { WorkflowList } from "@/components/workflows/workflow-list"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "New automation" }

export default function NewAutomationPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewAutomationContent />
    </Suspense>
  )
}

async function NewAutomationContent() {
  const { access } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Automations are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="New automation"
          description="The form validates the draft. Saving reports that storage is not connected and keeps what you typed."
        />
        <AutomationForm />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="New workflow"
        description="Creating a workflow saves a draft for this organization. It does not run until it is activated."
      />
      <WorkflowList />
    </>
  )
}
