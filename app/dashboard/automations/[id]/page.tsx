import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AutomationDetail } from "@/components/dashboard/automation-detail"
import { WorkflowBuilder } from "@/components/workflows/workflow-builder"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Automation" }

export default function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AutomationContent params={params} />
    </Suspense>
  )
}

async function AutomationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Automations are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    const automation = records.automations.find((item) => item.id === id)
    if (!automation) notFound()
    const runs = records.runs.filter((run) => run.automationId === automation.id)
    return (
      <>
        <PageHeader
          title={automation.name}
          description="This record is a development fixture. Tabs switch the fixture detail, steps, and runs."
        />
        <AutomationDetail automation={automation} runs={runs} />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Workflow"
        description="Changes stay in this organization. Activation publishes an immutable version."
      />
      <WorkflowBuilder workflowId={id} />
    </>
  )
}
