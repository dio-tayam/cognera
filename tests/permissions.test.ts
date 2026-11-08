import { describe, expect, test } from "vitest"
import { can, permissionGroups, permissionsFor, roles } from "@/lib/auth/permissions"
import { canPublishCms, canWriteCms } from "@/lib/cms/schema"
import { canActivateWorkflows, canWriteWorkflows } from "@/lib/workflows/store"

describe("permissions", () => {
  test("roles are strictly nested: member ⊂ editor ⊂ admin ⊂ owner", () => {
    const order = ["member", "editor", "admin", "owner"] as const
    for (let index = 1; index < order.length; index += 1) {
      const lower = new Set(permissionsFor(order[index - 1]!))
      const higher = new Set(permissionsFor(order[index]!))
      for (const permission of lower) expect(higher.has(permission)).toBe(true)
      expect(higher.size).toBeGreaterThan(lower.size)
    }
  })

  test("matches the database policies for content and workflows", () => {
    expect(roles.filter(canWriteCms)).toEqual(["owner", "admin", "editor"])
    expect(roles.filter(canPublishCms)).toEqual(["owner", "admin"])
    expect(roles.filter(canWriteWorkflows)).toEqual(["owner", "admin", "editor"])
    expect(roles.filter(canActivateWorkflows)).toEqual(["owner", "admin"])
  })

  test("only owners delete the organization; unknown roles get nothing", () => {
    expect(roles.filter((role) => can(role, "org.delete"))).toEqual(["owner"])
    expect(can("superuser", "leads.view")).toBe(false)
    expect(can(null, "ai.use")).toBe(false)
  })

  test("every permission is granted to at least the owner", () => {
    for (const group of permissionGroups) for (const item of group.items) expect(can("owner", item.id)).toBe(true)
  })
})
