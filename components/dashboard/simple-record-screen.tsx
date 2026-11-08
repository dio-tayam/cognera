"use client"

import type { ReactNode } from "react"
import { RecordTable, type RecordColumn } from "@/components/data/record-table"

export function SimpleRecordScreen<T>({
  rows,
  columns,
  getRowId,
  searchLabel,
  searchText,
  emptyTitle,
  emptyDescription,
  toolbar,
}: {
  rows: readonly T[]
  columns: Array<RecordColumn<T>>
  getRowId: (row: T) => string
  searchLabel: string
  searchText: (row: T) => string
  emptyTitle: string
  emptyDescription: string
  toolbar?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      <RecordTable
        rows={rows}
        columns={columns}
        getRowId={getRowId}
        searchLabel={searchLabel}
        searchText={searchText}
        initialSort={{
          id: columns.find((column) => column.sortValue)?.id ?? columns[0]?.id ?? "id",
          direction: "asc",
        }}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </div>
  )
}
