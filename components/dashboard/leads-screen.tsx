"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RecordTable } from "@/components/data/record-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { FixtureLead, WorkspaceRecords } from "@/lib/preview/fixtures"

export function LeadsScreen({ records }: { records: WorkspaceRecords }) {
  const [leads, setLeads] = useState(records.leads)
  const [viewing, setViewing] = useState<FixtureLead | null>(null)
  const [removing, setRemoving] = useState<FixtureLead | null>(null)
  const fixture = records.source === "development-fixture"

  return (
    <>
      <RecordTable
        rows={leads}
        getRowId={(row) => row.id}
        searchLabel="Search leads"
        searchText={(row) => `${row.name} ${row.email} ${row.company}`}
        initialSort={{ id: "name", direction: "asc" }}
        emptyTitle="No leads are stored"
        emptyDescription="Lead storage is not connected. This list stays empty instead of showing sample businesses."
        columns={[
          { id: "name", header: "Name", sortValue: (row) => row.name, cell: (row) => row.name },
          {
            id: "company",
            header: "Company",
            sortValue: (row) => row.company,
            cell: (row) => row.company,
          },
          {
            id: "status",
            header: "Status",
            sortValue: (row) => row.status,
            cell: (row) => (
              <Badge variant="outline">{fixture ? `Fixture · ${row.status}` : row.status}</Badge>
            ),
          },
          {
            id: "actions",
            header: "Actions",
            cell: (row) => (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setViewing(row)}>
                  View {row.name}
                </Button>
                {fixture ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setRemoving(row)}
                  >
                    Remove {row.name}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      <Sheet open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{viewing?.name ?? "Lead"}</SheetTitle>
            <SheetDescription>
              {fixture
                ? "Development fixture. This lead is not stored."
                : "Lead storage is not connected."}
            </SheetDescription>
          </SheetHeader>
          {viewing ? (
            <dl className="grid gap-3 px-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{viewing.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Company</dt>
                <dd>{viewing.company}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>{viewing.updatedAt}</dd>
              </div>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this preview lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {removing?.name ?? "the lead"} from the preview list in this browser. No
              server record will be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!removing) return
                const name = removing.name
                setLeads((current) => current.filter((lead) => lead.id !== removing.id))
                setRemoving(null)
                toast.success(
                  `Removed ${name} from this preview. Nothing was deleted on the server.`,
                )
              }}
            >
              Remove from preview
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
