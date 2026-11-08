import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { SectionBlock } from "@/components/layout/section-block"
import { AcceptInvitationForm, InviteForm } from "@/components/dashboard/settings-forms"
import { Badge } from "@/components/ui/badge"
import { requireCrmContext } from "@/lib/crm/context"
import { getMembershipSummary } from "@/lib/org/store"

export const metadata: Metadata = { title: "Team" }

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description="Invitations are stored for a signed-in owner or admin. No email is sent from this app."
      />
      <Suspense fallback={<PageSkeleton />}>
        <MembershipSummary />
      </Suspense>
      <SectionBlock
        title="Invite"
        description="Sending an invitation does not email anyone. A token is shown once so it can be delivered manually."
      >
        <InviteForm />
      </SectionBlock>
      <SectionBlock
        title="Accept"
        description="Acceptance uses the signed-in account email. A token for a different address is rejected."
      >
        <AcceptInvitationForm />
      </SectionBlock>
    </>
  )
}

async function MembershipSummary() {
  await connection()
  const access = await requireCrmContext()
  if (!access.ok) return null
  const summary = await getMembershipSummary(access.context.database, {
    organizationId: access.context.organizationId,
    userId: access.context.userId,
  }).catch(() => null)
  if (!summary) return null

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">
          {summary.total} member{summary.total === 1 ? "" : "s"} in this organization
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.byRole).map(([role, count]) => (
            <Badge key={role} variant="outline">
              {count} {role}
              {count === 1 ? "" : "s"}
            </Badge>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Names and emails stay private between members — only role counts are shown here. Row-level security
        only lets you read your own profile, by design.
      </p>
    </div>
  )
}
