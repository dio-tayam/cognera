import { afterEach, describe, expect, test } from "vitest"
import { AppError } from "@/lib/errors"
import { csvCell } from "@/lib/crm/csv"
import {
  addLeadNote,
  capturePublicLead,
  createLead,
  deleteLead,
  exportLeadsCsv,
  getLead,
  leadActivity,
  listLeads,
  updateLead,
} from "@/lib/crm/leads"
import { leadListSchema, leadWriteSchema, roleAllows } from "@/lib/crm/schema"
import { createOrganization } from "@/lib/org/store"
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

async function orgWith(
  client: Awaited<ReturnType<typeof database>>,
  slug: string,
  ownerId: string,
  memberId: string,
) {
  const organizationId = await createOrganization(client, { name: slug, slug, userId: ownerId })
  await client.transaction(async (tx) => {
    await tx.query("select set_config('app.member_sync', '1', true)")
    await tx.query(
      "insert into organization_members (organization_id, user_id, role) values ($1::uuid, $2, 'editor'), ($1::uuid, $3, 'member')",
      [organizationId, `${slug}-editor`, memberId],
    )
  })
  return organizationId
}

describe("lead CRM", () => {
  test("creates, filters, pages, notes, archives, restores, and deletes inside one organization", async () => {
    const client = await database()
    const organizationId = await orgWith(client, "alpha", "owner-1", "member-1")
    const owner = { organizationId, userId: "owner-1", role: "owner" }
    const editor = { organizationId, userId: "alpha-editor", role: "editor" }
    const member = { organizationId, userId: "member-1", role: "member" }

    expect(() => leadWriteSchema.parse({ name: "", email: "not-an-email" })).toThrow()

    const first = await createLead(client, editor, {
      name: "Ada",
      email: "ada@example.com",
      company: "Northwind",
      phone: "+1 555 0100",
      source: "manual",
      ownerId: "owner-1",
    })
    await createLead(client, editor, {
      name: "Bea",
      email: "bea@example.com",
      company: null,
      phone: null,
      source: "referral",
      ownerId: null,
    })
    await createLead(client, editor, {
      name: "Cy",
      email: "cy@example.com",
      company: null,
      phone: null,
      source: "manual",
      ownerId: null,
    })

    await expect(
      createLead(client, editor, {
        name: "Ada again",
        email: "ADA@example.com",
        company: null,
        phone: null,
        source: "manual",
        ownerId: null,
      }),
    ).rejects.toMatchObject({ code: "duplicate_lead", status: 409 })

    await expect(
      createLead(client, member, {
        name: "No",
        email: "no@example.com",
        company: null,
        phone: null,
        source: "manual",
        ownerId: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" })

    const filtered = await listLeads(client, owner, {
      ...leadListSchema.parse({ q: "Northwind", pageSize: "2" }),
    })
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.id).toBe(first.id)

    const page = await listLeads(client, owner, leadListSchema.parse({ pageSize: "2", page: "2" }))
    expect(page.items).toHaveLength(1)
    expect(page.pageCount).toBe(2)

    const note = await addLeadNote(client, editor, first.id, "Called Ada.")
    expect(note.body).toBe("Called Ada.")
    const archived = await updateLead(client, editor, first.id, { status: "archived" })
    expect(archived.status).toBe("archived")
    const restored = await updateLead(client, editor, first.id, { status: "qualified" })
    expect(restored.status).toBe("qualified")

    const detail = await getLead(client, member, first.id)
    expect(detail.notes).toHaveLength(1)
    expect(detail.activity.map((item) => item.action)).toContain("lead.created")

    const activity = await leadActivity(client, member, first.id)
    expect(activity.length).toBeGreaterThan(0)

    await expect(deleteLead(client, member, first.id)).rejects.toMatchObject({ code: "forbidden" })
    await deleteLead(client, owner, first.id)
    await expect(getLead(client, owner, first.id)).rejects.toBeInstanceOf(AppError)

    const csv = await exportLeadsCsv(client, owner, leadListSchema.parse({}))
    expect(csv.split("\n")[0]).toBe("Name,Email,Company,Phone,Source,Status,Owner,Created,Updated")
    expect(csvCell("=cmd")).toBe("'=cmd")
    expect(csvCell("+1")).toBe("'+1")
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(roleAllows("member", "delete")).toBe(false)
    expect(roleAllows("editor", "write")).toBe(true)
  })

  test("hides another organization's leads and rate-limits contact bursts", async () => {
    const client = await database()
    const alpha = await orgWith(client, "alpha", "owner-a", "member-a")
    const beta = await orgWith(client, "beta", "owner-b", "member-b")
    const lead = await createLead(
      client,
      { organizationId: alpha, userId: "owner-a", role: "owner" },
      {
        name: "Ada",
        email: "ada@example.com",
        company: null,
        phone: null,
        source: "manual",
        ownerId: null,
      },
    )

    const foreign = await listLeads(
      client,
      { organizationId: beta, userId: "owner-b", role: "owner" },
      leadListSchema.parse({}),
    )
    expect(foreign.total).toBe(0)
    await expect(
      getLead(client, { organizationId: beta, userId: "owner-b", role: "owner" }, lead.id),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      updateLead(client, { organizationId: beta, userId: "owner-b", role: "owner" }, lead.id, {
        name: "Stolen",
      }),
    ).rejects.toMatchObject({ status: 404 })

    await capturePublicLead(client, alpha, {
      name: "Guest",
      email: "guest@example.com",
      message: "Please contact me about a project.",
    })
    await capturePublicLead(client, alpha, {
      name: "Guest",
      email: "guest@example.com",
      message: "This is a second message for the same person.",
    })
    const stored = await listLeads(
      client,
      { organizationId: alpha, userId: "owner-a", role: "owner" },
      leadListSchema.parse({ q: "guest@example.com" }),
    )
    expect(stored.total).toBe(1)
    const notes = await getLead(
      client,
      { organizationId: alpha, userId: "owner-a", role: "owner" },
      stored.items[0]!.id,
    )
    expect(notes.notes).toHaveLength(2)

    const bucket = "b".repeat(64)
    const first = await client.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, 1, 60) as allowed",
      [bucket],
    )
    const second = await client.query<{ allowed: boolean }>(
      "select app_consume_rate_limit($1, 1, 60) as allowed",
      [bucket],
    )
    expect(first.rows[0]?.allowed).toBe(true)
    expect(second.rows[0]?.allowed).toBe(false)

    await expect(leadListSchema.parseAsync({ pageSize: "500" })).rejects.toThrow()
    await expect(
      addLeadNote(
        client,
        { organizationId: alpha, userId: "owner-a", role: "owner" },
        crypto.randomUUID(),
        "Nope",
      ),
    ).rejects.toMatchObject({ status: 404 })
  })
})
