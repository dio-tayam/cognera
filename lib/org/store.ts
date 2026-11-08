import type { SqlClient } from "@/lib/db/types"
import {
  acceptInvitationSchema,
  invitationSchema,
  leadSchema,
  memberRoleSchema,
  organizationSchema,
} from "@/lib/org/schema"
import { hashInvitationToken } from "@/lib/org/tokens"

export async function createOrganization(
  client: SqlClient,
  input: { name: string; slug: string; userId: string },
): Promise<string> {
  const parsed = organizationSchema.parse(input)
  const result = await client.query<{ app_create_organization: string }>(
    "select app_create_organization($1, $2, $3) as app_create_organization",
    [parsed.name, parsed.slug, parsed.userId],
  )
  const id = result.rows[0]?.app_create_organization
  if (!id) throw new Error("Organization was not created.")
  return id
}

export async function insertLead(
  client: SqlClient,
  input: { organizationId: string; name: string; email: string },
): Promise<string> {
  const parsed = leadSchema.parse(input)
  const result = await client.query<{ id: string }>(
    `insert into leads (organization_id, name, email)
     values ($1::uuid, $2, $3)
     returning id`,
    [parsed.organizationId, parsed.name, parsed.email],
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error("Lead was not created.")
  return id
}

export async function setMemberRole(
  client: SqlClient,
  input: { organizationId: string; userId: string; role: string; actorId: string },
): Promise<void> {
  const parsed = memberRoleSchema.parse(input)
  await client.query("select app_set_member_role($1::uuid, $2, $3, $4)", [
    parsed.organizationId,
    parsed.userId,
    parsed.role,
    parsed.actorId,
  ])
}

export async function createInvitation(
  client: SqlClient,
  input: { organizationId: string; email: string; role: string; actorId: string; token: string },
): Promise<string> {
  const parsed = invitationSchema.parse(input)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const result = await client.query<{ app_create_invitation: string }>(
    "select app_create_invitation($1::uuid, $2, $3, $4, $5, $6::timestamptz) as app_create_invitation",
    [
      parsed.organizationId,
      parsed.email,
      parsed.role,
      hashInvitationToken(input.token),
      parsed.actorId,
      expires,
    ],
  )
  const id = result.rows[0]?.app_create_invitation
  if (!id) throw new Error("Invitation was not created.")
  return id
}

export async function acceptInvitation(
  client: SqlClient,
  input: { token: string; userId: string; email: string },
): Promise<string> {
  const parsed = acceptInvitationSchema.parse(input)
  const result = await client.query<{ app_accept_invitation: string }>(
    "select app_accept_invitation($1, $2, $3) as app_accept_invitation",
    [hashInvitationToken(parsed.token), parsed.userId, parsed.email],
  )
  const id = result.rows[0]?.app_accept_invitation
  if (!id) throw new Error("Invitation was not accepted.")
  return id
}

export async function deleteAccount(client: SqlClient, userId: string): Promise<void> {
  await client.query("select app_delete_account($1)", [userId])
}

export async function memberRole(
  client: SqlClient,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const result = await client.query<{ role: string }>(
    "select role from organization_members where organization_id = $1::uuid and user_id = $2",
    [organizationId, userId],
  )
  return result.rows[0]?.role ?? null
}
