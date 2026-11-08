import type { Metadata } from "next"
import { EmptyState } from "@/components/layout/empty-state"
import { PageHeader } from "@/components/layout/page-header"
import { SectionBlock } from "@/components/layout/section-block"
import { AcceptInvitationForm, InviteForm } from "@/components/dashboard/settings-forms"

export const metadata: Metadata = { title: "Team" }

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description="Invitations are stored for a signed-in owner or admin. No email is sent from this app."
      />
      <EmptyState
        title="Membership is enforced in the database"
        description="This screen does not list every member. Role changes still go through the database, which rejects self-promotion."
      />
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
