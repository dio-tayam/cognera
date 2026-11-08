"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RecordTable } from "@/components/data/record-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { WorkspaceRecords } from "@/lib/preview/fixtures"

export function MediaScreen({ records }: { records: WorkspaceRecords }) {
  const [picked, setPicked] = useState<string | null>(null)
  const fixture = records.source === "development-fixture"

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col items-start gap-3"
        onSubmit={(event) => {
          event.preventDefault()
        }}
      >
        <label htmlFor="media-file" className="text-sm font-medium">
          Choose a file
        </label>
        <input
          id="media-file"
          type="file"
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) {
              setPicked(null)
              return
            }
            setPicked(file.name)
            toast.error(`${file.name} was not uploaded. Media storage is not connected.`)
          }}
        />
        <Button
          type="submit"
          disabled
          title="Media storage is not connected. Files are not uploaded."
        >
          Upload file
        </Button>
        <p className="text-sm text-muted-foreground">
          Media storage is not connected. Choosing a file does not upload it.
          {picked ? ` Selected ${picked}.` : ""}
        </p>
      </form>
      <RecordTable
        rows={records.media}
        getRowId={(row) => row.id}
        searchLabel="Search media"
        searchText={(row) => `${row.filename} ${row.type}`}
        initialSort={{ id: "filename", direction: "asc" }}
        emptyTitle="No media is stored"
        emptyDescription="Media storage is not connected."
        columns={[
          {
            id: "filename",
            header: "File",
            sortValue: (row) => row.filename,
            cell: (row) => row.filename,
          },
          { id: "type", header: "Type", sortValue: (row) => row.type, cell: (row) => row.type },
          {
            id: "source",
            header: "Source",
            cell: () => (
              <Badge variant={fixture ? "warning" : "outline"}>
                {fixture ? "Fixture" : "None"}
              </Badge>
            ),
          },
        ]}
      />
    </div>
  )
}
