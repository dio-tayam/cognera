import { AppError } from "@/lib/errors"
import { dispatchLeadCreated } from "@/lib/workflows/dispatch"
import { withTenant } from "@/lib/db/tenant"
import type { SqlClient } from "@/lib/db/types"
import { pageCount, type PageResult } from "@/lib/http/pagination"
import { csvRow } from "@/lib/crm/csv"
import {
  roleAllows,
  type LeadListQuery,
  type LeadPatchInput,
  type LeadWriteInput,
} from "@/lib/crm/schema"

export type LeadRecord = {
  id: string
  name: string
  email: string
  company: string | null
  phone: string | null
  source: string
  status: string
  ownerId: string | null
  createdAt: string
  updatedAt: string
}

export type LeadNote = {
  id: string
  body: string
  authorId: string
  createdAt: string
}

export type LeadActivity = {
  id: string
  action: string
  actorId: string
  createdAt: string
}

type LeadRow = {
  id: string
  name: string
  email: string
  company: string | null
  phone: string | null
  source: string
  status: string
  owner_id: string | null
  created_at: Date | string
  updated_at: Date | string
}

const sortColumns: Record<LeadListQuery["sort"], string> = {
  name: "name",
  email: "email",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
}

function stamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toLead(row: LeadRow): LeadRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    source: row.source,
    status: row.status,
    ownerId: row.owner_id,
    createdAt: stamp(row.created_at),
    updatedAt: stamp(row.updated_at),
  }
}

function databaseError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("leads_organization_email_key") || message.includes("duplicate key")) {
    return new AppError("duplicate_lead", "A lead with this email already exists.", 409)
  }
  if (message.includes("leads_phone_shape") || message.includes("phone")) {
    return new AppError("invalid_lead", "Enter a valid phone number.", 400)
  }
  if (message.includes("owner is not a member")) {
    return new AppError("invalid_owner", "The owner must be a member of this organization.", 400)
  }
  if (error instanceof AppError) return error
  return new AppError("database_error", "The lead could not be saved.", 500)
}

async function assertOwner(tx: SqlClient, organizationId: string, ownerId: string | null) {
  if (!ownerId) return
  const member = await tx.query(
    "select user_id from organization_members where organization_id = $1::uuid and user_id = $2",
    [organizationId, ownerId],
  )
  if (member.rowCount === 0)
    throw new AppError("invalid_owner", "The owner must be a member of this organization.", 400)
}

async function audit(
  tx: SqlClient,
  organizationId: string,
  actorId: string,
  action: string,
  leadId: string,
) {
  await tx.query("select app_record_audit($1::uuid, $2, $3, 'lead', $4)", [
    organizationId,
    actorId,
    action,
    leadId,
  ])
}

async function requireLead(tx: SqlClient, id: string): Promise<LeadRecord> {
  const result = await tx.query<LeadRow>(
    `select id, name, email, company, phone, source, status, owner_id, created_at, updated_at
     from leads where id = $1::uuid`,
    [id],
  )
  const row = result.rows[0]
  if (!row) throw new AppError("not_found", "That lead was not found.", 404)
  return toLead(row)
}

export async function listLeads(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  query: LeadListQuery,
): Promise<PageResult<LeadRecord> & { permissions: { canWrite: boolean; canDelete: boolean } }> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      const role = scope.role
      if (!roleAllows(role, "read")) throw new AppError("forbidden", "You cannot view leads.", 403)
      const filters = ["organization_id = $1::uuid"]
      const params: unknown[] = [scope.organizationId]
      if (query.q) {
        params.push(`%${query.q}%`)
        filters.push(
          `(name ilike $${params.length} or email ilike $${params.length} or coalesce(company, '') ilike $${params.length} or coalesce(phone, '') ilike $${params.length})`,
        )
      }
      if (query.status) {
        params.push(query.status)
        filters.push(`status = $${params.length}`)
      }
      if (query.source) {
        params.push(query.source)
        filters.push(`source = $${params.length}`)
      }
      if (query.ownerId) {
        params.push(query.ownerId)
        filters.push(`owner_id = $${params.length}`)
      }
      const where = filters.join(" and ")
      const totalResult = await tx.query<{ total: number }>(
        `select count(*)::int as total from leads where ${where}`,
        params,
      )
      const total = totalResult.rows[0]?.total ?? 0
      const sort = sortColumns[query.sort]
      const direction = query.direction === "asc" ? "asc" : "desc"
      const offset = (query.page - 1) * query.pageSize
      const rows = await tx.query<LeadRow>(
        `select id, name, email, company, phone, source, status, owner_id, created_at, updated_at
       from leads where ${where}
       order by ${sort} ${direction}, id asc
       limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, query.pageSize, offset],
      )
      return {
        items: rows.rows.map(toLead),
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: pageCount(total, query.pageSize),
        permissions: {
          canWrite: roleAllows(role, "write"),
          canDelete: roleAllows(role, "delete"),
        },
      }
    },
  )
}

export async function createLead(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  input: LeadWriteInput,
): Promise<LeadRecord> {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = scope.role
        if (!roleAllows(role, "write"))
          throw new AppError("forbidden", "You cannot create leads.", 403)
        await assertOwner(tx, scope.organizationId, input.ownerId)
        const inserted = await tx.query<{ id: string }>(
          `insert into leads (organization_id, name, email, company, phone, source, owner_id)
         values ($1::uuid, $2, $3, $4, $5, $6, $7)
         returning id`,
          [
            scope.organizationId,
            input.name,
            input.email.toLowerCase(),
            input.company,
            input.phone,
            input.source,
            input.ownerId,
          ],
        )
        const id = inserted.rows[0]?.id
        if (!id) throw new AppError("database_error", "The lead could not be saved.", 500)
        await audit(tx, scope.organizationId, scope.userId, "lead.created", id)
        const lead = await requireLead(tx, id)
        await dispatchLeadCreated(tx, scope.organizationId, {
          id: lead.id,
          email: lead.email,
          name: lead.name,
          source: lead.source,
        })
        return lead
      },
    )
  } catch (error) {
    throw databaseError(error)
  }
}

export async function getLead(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  id: string,
): Promise<{ lead: LeadRecord; notes: LeadNote[]; activity: LeadActivity[] }> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      const role = scope.role
      if (!roleAllows(role, "read")) throw new AppError("forbidden", "You cannot view leads.", 403)
      const lead = await requireLead(tx, id)
      const notes = await tx.query<{
        id: string
        body: string
        author_id: string
        created_at: Date | string
      }>(
        `select id, body, author_id, created_at from lead_notes
       where lead_id = $1::uuid order by created_at asc`,
        [id],
      )
      const activity = await listActivity(tx, id)
      return {
        lead,
        notes: notes.rows.map((row) => ({
          id: row.id,
          body: row.body,
          authorId: row.author_id,
          createdAt: stamp(row.created_at),
        })),
        activity,
      }
    },
  )
}

async function listActivity(tx: SqlClient, id: string): Promise<LeadActivity[]> {
  const rows = await tx.query<{
    id: string
    action: string
    actor_id: string
    created_at: Date | string
  }>(
    `select id, action, actor_id, created_at from audit_logs
     where entity = 'lead' and entity_id = $1
     order by created_at desc
     limit 100`,
    [id],
  )
  return rows.rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    createdAt: stamp(row.created_at),
  }))
}

export async function updateLead(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  id: string,
  input: LeadPatchInput,
): Promise<LeadRecord> {
  try {
    return await withTenant(
      client,
      { tenantId: scope.organizationId, userId: scope.userId },
      async (tx) => {
        const role = scope.role
        if (!roleAllows(role, "write"))
          throw new AppError("forbidden", "You cannot edit leads.", 403)
        const current = await requireLead(tx, id)
        if (input.ownerId !== undefined) await assertOwner(tx, scope.organizationId, input.ownerId)
        const nextStatus = input.status ?? current.status
        const params: unknown[] = []
        const sets = ["updated_at = now()"]

        function add(column: string, value: unknown) {
          params.push(value)
          sets.push(`${column} = $${params.length}`)
        }

        if (input.name !== undefined) add("name", input.name)
        if (input.email !== undefined) add("email", input.email.toLowerCase())
        if (input.company !== undefined) add("company", input.company)
        if (input.phone !== undefined) add("phone", input.phone)
        if (input.source !== undefined) add("source", input.source)
        if (input.ownerId !== undefined) add("owner_id", input.ownerId)

        if (nextStatus !== current.status) {
          if (nextStatus === "archived") {
            if (current.status === "archived") {
              throw new AppError("invalid_lead", "This lead is already archived.", 400)
            }
            add("status", "archived")
            add("archived_from", current.status)
          } else if (current.status === "archived") {
            add("status", nextStatus)
            sets.push("archived_from = null")
          } else {
            add("status", nextStatus)
          }
          await tx.query(
            `update leads set ${sets.join(", ")} where id = $${params.length + 1}::uuid`,
            [...params, id],
          )
          const action =
            nextStatus === "archived"
              ? "lead.archived"
              : current.status === "archived"
                ? "lead.restored"
                : "lead.updated"
          await audit(tx, scope.organizationId, scope.userId, action, id)
          return requireLead(tx, id)
        }

        if (sets.length === 1) return current
        await tx.query(
          `update leads set ${sets.join(", ")} where id = $${params.length + 1}::uuid`,
          [...params, id],
        )
        await audit(tx, scope.organizationId, scope.userId, "lead.updated", id)
        return requireLead(tx, id)
      },
    )
  } catch (error) {
    throw databaseError(error)
  }
}

export async function deleteLead(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  id: string,
): Promise<void> {
  await withTenant(client, { tenantId: scope.organizationId, userId: scope.userId }, async (tx) => {
    const role = scope.role
    if (!roleAllows(role, "delete"))
      throw new AppError("forbidden", "You cannot delete leads.", 403)
    await requireLead(tx, id)
    await audit(tx, scope.organizationId, scope.userId, "lead.deleted", id)
    await tx.query("delete from lead_notes where lead_id = $1::uuid", [id])
    const removed = await tx.query("delete from leads where id = $1::uuid", [id])
    if (removed.rowCount === 0) throw new AppError("not_found", "That lead was not found.", 404)
  })
}

export async function addLeadNote(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  id: string,
  body: string,
): Promise<LeadNote> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      const role = scope.role
      if (!roleAllows(role, "write")) throw new AppError("forbidden", "You cannot add notes.", 403)
      await requireLead(tx, id)
      const inserted = await tx.query<{
        id: string
        body: string
        author_id: string
        created_at: Date | string
      }>(
        `insert into lead_notes (organization_id, lead_id, body, author_id)
       values ($1::uuid, $2::uuid, $3, $4)
       returning id, body, author_id, created_at`,
        [scope.organizationId, id, body, scope.userId],
      )
      const row = inserted.rows[0]
      if (!row) throw new AppError("database_error", "The note could not be saved.", 500)
      await audit(tx, scope.organizationId, scope.userId, "lead.note_created", id)
      return {
        id: row.id,
        body: row.body,
        authorId: row.author_id,
        createdAt: stamp(row.created_at),
      }
    },
  )
}

export async function leadActivity(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  id: string,
): Promise<LeadActivity[]> {
  return withTenant(
    client,
    { tenantId: scope.organizationId, userId: scope.userId },
    async (tx) => {
      const role = scope.role
      if (!roleAllows(role, "read")) throw new AppError("forbidden", "You cannot view leads.", 403)
      await requireLead(tx, id)
      return listActivity(tx, id)
    },
  )
}

export async function exportLeadsCsv(
  client: SqlClient,
  scope: { organizationId: string; userId: string; role: string },
  query: LeadListQuery,
): Promise<string> {
  const page = await listLeads(client, scope, { ...query, page: 1, pageSize: 50 })
  const header = csvRow([
    "Name",
    "Email",
    "Company",
    "Phone",
    "Source",
    "Status",
    "Owner",
    "Created",
    "Updated",
  ])
  const lines = [header]
  let current = page
  let guard = 0
  while (guard < 100) {
    for (const lead of current.items) {
      lines.push(
        csvRow([
          lead.name,
          lead.email,
          lead.company,
          lead.phone,
          lead.source,
          lead.status,
          lead.ownerId,
          lead.createdAt,
          lead.updatedAt,
        ]),
      )
    }
    if (current.page >= current.pageCount) break
    guard += 1
    current = await listLeads(client, scope, { ...query, page: current.page + 1, pageSize: 50 })
  }
  return `${lines.join("\n")}\n`
}

export async function capturePublicLead(
  client: SqlClient,
  organizationId: string,
  input: { name: string; email: string; message: string },
): Promise<void> {
  await client.query("select app_capture_public_lead($1::uuid, $2, $3, $4)", [
    organizationId,
    input.name,
    input.email,
    input.message,
  ])
}
