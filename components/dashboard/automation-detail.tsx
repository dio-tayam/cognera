"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { FixtureAutomation, FixtureRun } from "@/lib/preview/fixtures"

export function AutomationDetail({
  automation,
  runs,
}: {
  automation: FixtureAutomation
  runs: FixtureRun[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="warning">Fixture · {automation.status}</Badge>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
            <Button type="button" disabled>
              Run automation
            </Button>
          </TooltipTrigger>
          <TooltipContent>Running an automation is not connected.</TooltipContent>
        </Tooltip>
      </div>
      <p className="text-sm text-muted-foreground">Running an automation is not connected.</p>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Trigger</dt>
              <dd>{automation.trigger}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{automation.updatedAt}</dd>
            </div>
          </dl>
        </TabsContent>
        <TabsContent value="steps" className="pt-4">
          <ul className="flex flex-col gap-3">
            {automation.steps.map((step) => (
              <li key={step.id} className="rounded-lg border px-3 py-2">
                <p className="font-medium">{step.name}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="runs" className="pt-4">
          {runs.length === 0 ? (
            <p>No fixture runs are attached to this automation.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {runs.map((run) => (
                <li key={run.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-medium">{run.status}</p>
                  <p className="text-muted-foreground">{run.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
