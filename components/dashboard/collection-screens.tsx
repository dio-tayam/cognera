"use client"

import Link from "next/link"
import { DocumentDraftDialog } from "@/components/dashboard/document-draft-dialog"
import { SimpleRecordScreen } from "@/components/dashboard/simple-record-screen"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { WorkspaceRecords } from "@/lib/preview/fixtures"

export function AutomationsScreen({ records }: { records: WorkspaceRecords }) {
  const fixture = records.source === "development-fixture"
  return (
    <SimpleRecordScreen
      rows={records.automations}
      getRowId={(row) => row.id}
      searchLabel="Search automations"
      searchText={(row) => `${row.name} ${row.trigger}`}
      emptyTitle="No automations are stored"
      emptyDescription="Automation storage is not connected. Drafts on the new automation page are not saved."
      toolbar={
        <Link href="/dashboard/automations/new" className={buttonVariants()}>
          New automation
        </Link>
      }
      columns={[
        { id: "name", header: "Name", sortValue: (row) => row.name, cell: (row) => row.name },
        {
          id: "trigger",
          header: "Trigger",
          sortValue: (row) => row.trigger,
          cell: (row) => row.trigger,
        },
        {
          id: "status",
          header: "Status",
          sortValue: (row) => row.status,
          cell: () => (
            <Badge variant={fixture ? "warning" : "outline"}>
              {fixture ? "Fixture draft" : "None"}
            </Badge>
          ),
        },
        {
          id: "open",
          header: "Open",
          cell: (row) => (
            <Link
              href={`/dashboard/automations/${row.id}`}
              className="underline-offset-4 hover:underline"
            >
              Open {row.name}
            </Link>
          ),
        },
      ]}
    />
  )
}

export function RunsScreen({ records }: { records: WorkspaceRecords }) {
  const fixture = records.source === "development-fixture"
  return (
    <SimpleRecordScreen
      rows={records.runs}
      getRowId={(row) => row.id}
      searchLabel="Search runs"
      searchText={(row) => `${row.automation} ${row.status} ${row.detail}`}
      emptyTitle="No runs are stored"
      emptyDescription="The job runner is not connected to this screen. Failed and blocked rows appear only as labeled fixtures in preview."
      columns={[
        {
          id: "automation",
          header: "Automation",
          sortValue: (row) => row.automation,
          cell: (row) => row.automation,
        },
        {
          id: "status",
          header: "Status",
          sortValue: (row) => row.status,
          cell: (row) => (
            <Badge variant={row.status === "failed" ? "destructive" : "outline"}>
              {fixture ? `Fixture · ${row.status}` : row.status}
            </Badge>
          ),
        },
        { id: "detail", header: "Detail", cell: (row) => row.detail },
      ]}
    />
  )
}

export function DocumentsScreen({
  records,
  kind,
}: {
  records: WorkspaceRecords
  kind: "page" | "post"
}) {
  const rows = kind === "page" ? records.pages : records.posts
  const fixture = records.source === "development-fixture"
  return (
    <SimpleRecordScreen
      rows={rows}
      getRowId={(row) => row.id}
      searchLabel={kind === "page" ? "Search pages" : "Search posts"}
      searchText={(row) => row.title}
      emptyTitle={kind === "page" ? "No pages are stored" : "No posts are stored"}
      emptyDescription="Content storage is not connected. New drafts are validated and then refused."
      toolbar={<DocumentDraftDialog label={kind === "page" ? "New page" : "New post"} />}
      columns={[
        { id: "title", header: "Title", sortValue: (row) => row.title, cell: (row) => row.title },
        {
          id: "status",
          header: "Status",
          sortValue: (row) => row.status,
          cell: () => (
            <Badge variant={fixture ? "warning" : "outline"}>
              {fixture ? "Fixture draft" : "None"}
            </Badge>
          ),
        },
        {
          id: "updated",
          header: "Updated",
          sortValue: (row) => row.updatedAt,
          cell: (row) => row.updatedAt,
        },
      ]}
    />
  )
}
