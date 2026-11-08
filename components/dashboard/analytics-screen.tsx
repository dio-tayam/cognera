"use client"

import { EmptyState } from "@/components/layout/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AnalyticsScreen() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="content">Content</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-4">
        <EmptyState
          title="Analytics are not connected"
          description="No visitor, lead, or revenue metrics are shown. Connecting a date range would not change that, so the range control stays off."
        />
        <p className="mt-4 text-sm text-muted-foreground">
          Date ranges are unavailable because analytics are not connected.
        </p>
      </TabsContent>
      <TabsContent value="content" className="pt-4">
        <EmptyState
          title="Content analytics are not connected"
          description="Publishing is not stored, so there are no page or post counts to chart."
        />
      </TabsContent>
    </Tabs>
  )
}
