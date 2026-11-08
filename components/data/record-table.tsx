"use client"

import { useMemo, useState, type ReactNode } from "react"
import { EmptyState } from "@/components/layout/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { filterBySearch, paginate, sortRows, type SortDirection } from "@/lib/preview/query"

export type RecordColumn<T> = {
  id: string
  header: string
  sortValue?: (row: T) => string | number
  cell: (row: T) => ReactNode
}

export function RecordTable<T>({
  rows,
  columns,
  getRowId,
  searchLabel,
  searchText,
  pageSize = 5,
  initialSort,
  emptyTitle,
  emptyDescription,
}: {
  rows: readonly T[]
  columns: Array<RecordColumn<T>>
  getRowId: (row: T) => string
  searchLabel: string
  searchText: (row: T) => string
  pageSize?: number
  initialSort?: { id: string; direction: SortDirection }
  emptyTitle: string
  emptyDescription: string
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState(initialSort ?? null)
  const [page, setPage] = useState(1)

  const visible = useMemo(() => {
    const filtered = filterBySearch(rows, query, searchText)
    const column = columns.find((item) => item.id === sort?.id && item.sortValue)
    const ordered =
      sort && column?.sortValue ? sortRows(filtered, column.sortValue, sort.direction) : filtered
    return paginate(ordered, page, pageSize)
  }, [columns, page, pageSize, query, rows, searchText, sort])

  function changeSort(id: string) {
    setPage(1)
    setSort((current) => {
      if (!current || current.id !== id) return { id, direction: "asc" }
      return { id, direction: current.direction === "asc" ? "desc" : "asc" }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor={`${searchLabel}-search`}>{searchLabel}</Label>
        <div className="flex gap-2">
          <Input
            id={`${searchLabel}-search`}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={query.length === 0}
            onClick={() => {
              setQuery("")
              setPage(1)
            }}
          >
            Clear search
          </Button>
        </div>
        {query.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Clear search is unavailable until you type a search.
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : visible.rows.length === 0 ? (
        <EmptyState
          title="No matching records"
          description="Nothing in this list matches that search. Clear the search to see the full list."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  aria-sort={
                    sort?.id === column.id
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : column.sortValue
                        ? "none"
                        : undefined
                  }
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="font-medium"
                      onClick={() => changeSort(column.id)}
                    >
                      Sort by {column.header}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.rows.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((column) => (
                  <TableCell key={column.id}>{column.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {rows.length > 0 ? (
        <nav aria-label="Pagination" className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={visible.page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous page
          </Button>
          <p className="text-sm text-muted-foreground">
            Page {visible.page} of {visible.pageCount}
            {visible.page === 1 ? " First page." : ""}
            {visible.page === visible.pageCount ? " Last page." : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={visible.page === visible.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Next page
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
