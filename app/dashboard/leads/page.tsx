import type { Metadata } from "next"
import { Suspense } from "react"
import { CrmLeads } from "@/components/dashboard/crm-leads"
import { LeadsScreen } from "@/components/dashboard/leads-screen"
import { ErrorState } from "@/components/layout/error-state"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { loadWorkspace } from "@/lib/app/access"

export const metadata: Metadata = { title: "Leads" }

export default function LeadsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LeadsContent />
    </Suspense>
  )
}

async function LeadsContent() {
  const { access, records } = await loadWorkspace()
  if (access.mode === "blocked") {
    return <ErrorState title="Leads are unavailable" message={access.notice} />
  }
  if (access.mode === "preview") {
    return (
      <>
        <PageHeader
          title="Leads"
          description="Search, sort, and pagination run on development fixtures. Removing a row changes only this browser."
        />
        <LeadsScreen records={records} />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Leads"
        description="Leads are loaded from the current organization. Changes appear after the server confirms them."
      />
      <CrmLeads />
    </>
  )
}
