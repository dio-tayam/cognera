import { afterEach, describe, expect, test } from "vitest"
import { withTenant } from "@/lib/db/tenant"
import { sessionExpired } from "@/lib/auth/session-expiry"
import { publicErrorDetail } from "@/lib/errors"
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  deleteAccount,
  insertLead,
  memberRole,
  setMemberRole,
} from "@/lib/org/store"
import { newInvitationToken } from "@/lib/org/tokens"
import { organizationSchema } from "@/lib/org/schema"
import { createMigratedDatabase } from "./helpers/database"

const clients: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function database() {
  const client = await createMigratedDatabase()
  clients.push(client)
  return client
}

describe("organization authorization", () => {
  test("rejects unauthenticated reads and keeps organizations apart", async () => {
    const client = await database()
    const alpha = await createOrganization(client, {
      name: "Alpha",
      slug: "alpha",
      userId: "user-alpha",
    })
    const beta = await createOrganization(client, {
      name: "Beta",
      slug: "beta",
      userId: "user-beta",
    })
    const leadId = await withTenant(client, { tenantId: alpha, userId: "user-alpha" }, (tx) =>
      insertLead(tx, { organizationId: alpha, name: "Ada", email: "ada@example.com" }),
    )

    await client.transaction(async (tx) => {
      await tx.query("set local role cognera_app")
      const hidden = await tx.query("select id from leads")
      expect(hidden.rows).toHaveLength(0)
    })

    const foreign = await withTenant(
      client,
      { tenantId: beta, userId: "user-beta" },
      async (tx) => {
        const seen = await tx.query("select id from leads")
        const updated = await tx.query("update leads set name = 'Stolen' where id = $1::uuid", [
          leadId,
        ])
        return { seen: seen.rows.length, updated: updated.rowCount }
      },
    )
    expect(foreign).toEqual({ seen: 0, updated: 0 })

    const kept = await client.query<{ name: string }>(
      "select name from leads where id = $1::uuid",
      [leadId],
    )
    expect(kept.rows[0]?.name).toBe("Ada")
  })

  test("lets an editor write content and blocks member writes and role escalation", async () => {
    const client = await database()
    const organizationId = await createOrganization(client, {
      name: "Alpha",
      slug: "alpha",
      userId: "owner-1",
    })
    await client.transaction(async (tx) => {
      await tx.query("select set_config('app.member_sync', '1', true)")
      await tx.query(
        "insert into organization_members (organization_id, user_id, role) values ($1::uuid, 'editor-1', 'editor'), ($1::uuid, 'member-1', 'member')",
        [organizationId],
      )
    })

    const leadId = await withTenant(
      client,
      { tenantId: organizationId, userId: "editor-1" },
      (tx) => insertLead(tx, { organizationId, name: "Ada", email: "ada@example.com" }),
    )
    expect(leadId).toMatch(/^[0-9a-f-]{36}$/)

    const memberWrite = await withTenant(
      client,
      { tenantId: organizationId, userId: "member-1" },
      (tx) =>
        tx.query(
          "insert into leads (organization_id, name, email) values ($1::uuid, 'No', 'no@example.com')",
          [organizationId],
        ),
    ).catch((error: unknown) => error)
    expect(memberWrite).toBeInstanceOf(Error)

    await expect(
      setMemberRole(client, {
        organizationId,
        userId: "member-1",
        role: "admin",
        actorId: "member-1",
      }),
    ).rejects.toThrow(/own role/)
    expect(await memberRole(client, organizationId, "member-1")).toBe("member")

    await expect(
      setMemberRole(client, {
        organizationId,
        userId: "editor-1",
        role: "owner",
        actorId: "member-1",
      }),
    ).rejects.toThrow(/not permitted|owner/)
    expect(await memberRole(client, organizationId, "editor-1")).toBe("editor")
  })

  test("rejects invalid identifiers, foreign keys, and invitation mismatches", async () => {
    const client = await database()
    expect(() =>
      organizationSchema.parse({ name: "Alpha", slug: "Not Slug", userId: "user-1" }),
    ).toThrow()

    const organizationId = await createOrganization(client, {
      name: "Alpha",
      slug: "alpha",
      userId: "owner-1",
    })
    await expect(
      client.query(
        "insert into lead_notes (organization_id, lead_id, body, author_id) values ($1::uuid, $2::uuid, 'note', 'owner-1')",
        [organizationId, crypto.randomUUID()],
      ),
    ).rejects.toThrow()

    const token = newInvitationToken()
    await createInvitation(client, {
      organizationId,
      email: "person@example.com",
      role: "editor",
      actorId: "owner-1",
      token,
    })
    await expect(
      acceptInvitation(client, {
        token,
        userId: "person-1",
        email: "other@example.com",
      }),
    ).rejects.toThrow(/email/)

    const accepted = await acceptInvitation(client, {
      token,
      userId: "person-1",
      email: "person@example.com",
    })
    expect(accepted).toBe(organizationId)
    expect(await memberRole(client, organizationId, "person-1")).toBe("editor")
    await expect(
      acceptInvitation(client, {
        token,
        userId: "person-2",
        email: "person@example.com",
      }),
    ).rejects.toThrow(/pending/)
  })

  test("rate-limits repeated attempts and blocks deleting the sole owner", async () => {
    const client = await database()
    const bucket = "a".repeat(64)
    const first = await client.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, 2, 60) as allowed",
      [bucket],
    )
    const second = await client.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, 2, 60) as allowed",
      [bucket],
    )
    const third = await client.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, 2, 60) as allowed",
      [bucket],
    )
    expect(first.rows[0]?.allowed).toBe(true)
    expect(second.rows[0]?.allowed).toBe(true)
    expect(third.rows[0]?.allowed).toBe(false)

    const organizationId = await createOrganization(client, {
      name: "Alpha",
      slug: "alpha",
      userId: "owner-1",
    })
    await expect(deleteAccount(client, "owner-1")).rejects.toThrow(/transfer ownership/)
    await client.transaction(async (tx) => {
      await tx.query("select set_config('app.member_sync', '1', true)")
      await tx.query(
        "insert into organization_members (organization_id, user_id, role) values ($1::uuid, 'owner-2', 'owner')",
        [organizationId],
      )
    })
    await deleteAccount(client, "owner-1")
    expect(await memberRole(client, organizationId, "owner-1")).toBeNull()
  })

  test("treats an expired session as signed out and redacts secrets", () => {
    expect(sessionExpired(1_700_000_000, 1_700_000_000_000)).toBe(true)
    expect(sessionExpired(1_800_000_000, 1_700_000_000_000)).toBe(false)
    expect(sessionExpired(null, Date.now())).toBe(true)
    const detail = publicErrorDetail(
      new Error(
        "postgres://cognera_app:secret@localhost/cognera user ada@example.com eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      ),
    )
    expect(detail).not.toContain("secret@")
    expect(detail).not.toContain("ada@example.com")
    expect(detail).not.toContain("eyJhbGci")
  })
})
