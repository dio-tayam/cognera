import { describe, expect, test } from "vitest"
import { fixtureLeads } from "@/lib/preview/fixtures"
import { filterBySearch, paginate, sortRows } from "@/lib/preview/query"

describe("preview queries", () => {
  test("filters, sorts, and paginates fixture leads", () => {
    const filtered = filterBySearch(
      fixtureLeads,
      "northwind",
      (lead) => `${lead.name} ${lead.company}`,
    )
    expect(filtered.map((lead) => lead.name)).toEqual(["Northwind Clinic"])

    const sorted = sortRows(fixtureLeads, (lead) => lead.name, "asc")
    expect(sorted[0]?.name).toBe("Amina Cole")
    expect(sorted.at(-1)?.name).toBe("Omar Dias")

    const page = paginate(sorted, 2, 5)
    expect(page.pageCount).toBe(3)
    expect(page.rows[0]?.name).toBe("Farah Singh")
  })
})
