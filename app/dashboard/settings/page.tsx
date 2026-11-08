import type { Metadata } from "next"
import Link from "next/link"
import { OrganizationForm, ProfileForm } from "@/components/dashboard/settings-forms"
import { PageHeader } from "@/components/layout/page-header"
import { SectionBlock } from "@/components/layout/section-block"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Profile and organization changes are saved when you are signed in and the database is configured. Local Postgres does not sign you in by itself."
      />
      <nav aria-label="Settings sections" className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/dashboard/settings/team" as const, title: "Team", body: "Invite people and change their roles." },
          { href: "/dashboard/settings/roles" as const, title: "Roles & permissions", body: "See what each role can do." },
          { href: "/dashboard/settings/security" as const, title: "Security", body: "Password and account deletion." },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-1 rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[var(--elevation-2)]"
          >
            <span className="font-semibold group-hover:text-brand">{item.title} →</span>
            <span className="text-sm text-muted-foreground">{item.body}</span>
          </Link>
        ))}
      </nav>
      <SectionBlock
        title="Organization"
        description="Creating an organization requires a Supabase session. The organization id is stored in an httpOnly cookie after the database confirms membership."
      >
        <OrganizationForm />
      </SectionBlock>
      <SectionBlock
        title="Profile"
        description="The display name is written to your profile when auth and the database are both configured."
      >
        <ProfileForm />
      </SectionBlock>
    </>
  )
}
