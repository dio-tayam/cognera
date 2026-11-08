import type { Metadata } from "next"
import { AnalyticsScreen } from "@/components/dashboard/analytics-screen"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Tabs switch the empty explanation. No charts or business numbers are shown."
      />
      <AnalyticsScreen />
    </>
  )
}
