import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { StatusBoard } from "@/components/status-board"
import { getHealthReport } from "@/lib/health/report"

export const metadata: Metadata = { title: "System status" }

export default function StatusPage() {
  return (
    <MarketingPage eyebrow="System status" title="System status" description="Each check reports passed, failed, or blocked. Blocked means the service was not configured.">
      <Suspense fallback={<PageSkeleton />}>
        <StatusContent />
      </Suspense>
    </MarketingPage>
  )
}

async function StatusContent() {
  await connection()
  const report = await getHealthReport()
  return <StatusBoard initialReport={report} />
}
