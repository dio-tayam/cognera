import type { Metadata } from "next"
import { Suspense } from "react"
import { connection } from "next/server"
import { DeleteAccountForm, PasswordForm } from "@/components/dashboard/settings-forms"
import { SectionBlock } from "@/components/layout/section-block"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { readSupabaseConfig } from "@/lib/auth/config"

export const metadata: Metadata = { title: "Security" }

export default function SecurityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SecurityContent />
    </Suspense>
  )
}

async function SecurityContent() {
  await connection()
  const config = readSupabaseConfig()
  const ready = config.state === "ready"
  return (
    <>
      <PageHeader
        title="Security"
        description="Password changes call Supabase for the signed-in user. They stay disabled until auth is configured."
      />
      <PasswordForm mode={ready ? "ready" : "unavailable"} reason={ready ? null : config.reason} />
      <SectionBlock
        title="Delete account"
        description="The sole owner of an organization must transfer ownership first. Auth-provider deletion also needs the server-only service role; without it, memberships are removed and the login can remain."
      >
        <DeleteAccountForm />
      </SectionBlock>
    </>
  )
}
