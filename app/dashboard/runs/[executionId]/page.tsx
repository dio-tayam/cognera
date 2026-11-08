import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { RunDetail } from "@/components/workflows/run-detail"
import { loadWorkspace } from "@/lib/app/access"
import { parseUuid } from "@/lib/crm/context"

export const metadata: Metadata = { title: "Run" }

export default function RunPage({ params }: { params: Promise<{ executionId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RunContent params={params} />
    </Suspense>
  )
}

async function RunContent({ params }: { params: Promise<{ executionId: string }> }) {
  const { executionId } = await params
  const id = parseUuid(executionId)
  if (!id) notFound()
  const { access } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Runs are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <ErrorState
        title="Run details need a signed-in organization"
        message="Preview mode has no stored runs."
      />
    )
  }
  return (
    <>
      <PageHeader
        title="Run"
        description="Each step is logged with its attempt, duration, output, and error."
        actions={
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            href="/dashboard/runs"
          >
            All runs
          </Link>
        }
      />
      <div className="max-w-3xl">
        <RunDetail executionId={id} />
      </div>
    </>
  )
}
