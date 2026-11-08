import type { Metadata } from "next"
import { AnalyticsScreen } from "@/components/dashboard/analytics-screen"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Leads, workflow runs, AI usage, and content counts for this organization."
      />
      <AnalyticsScreen />
    </>
  )
}
