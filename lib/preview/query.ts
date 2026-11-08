export type SortDirection = "asc" | "desc"

export function filterBySearch<T>(
  rows: readonly T[],
  query: string,
  text: (row: T) => string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]
  return rows.filter((row) => text(row).toLowerCase().includes(needle))
}

export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => string | number,
  direction: SortDirection,
): T[] {
  const sorted = [...rows].sort((left, right) => {
    const a = value(left)
    const b = value(right)
    if (typeof a === "number" && typeof b === "number") return a - b
    return String(a).localeCompare(String(b))
  })
  return direction === "asc" ? sorted : sorted.reverse()
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(Math.max(page, 1), pageCount)
  const start = (current - 1) * pageSize
  return {
    page: current,
    pageCount,
    rows: rows.slice(start, start + pageSize),
  }
}
