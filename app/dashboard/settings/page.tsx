import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { AppearanceForm } from "@/components/dashboard/appearance-form"
import { OrganizationForm, ProfileForm } from "@/components/dashboard/settings-forms"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { SectionBlock } from "@/components/layout/section-block"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { roleDescriptions, type Role } from "@/lib/auth/permissions"
import { requireCrmContext } from "@/lib/crm/context"
import { getMembershipSummary } from "@/lib/org/store"

export const metadata: Metadata = { title: "Settings" }

const sections = [
  { href: "/dashboard/settings/team" as const, title: "Team", body: "Invite people and change their roles." },
  { href: "/dashboard/settings/roles" as const, title: "Roles & permissions", body: "See what each role can do." },
  { href: "/dashboard/settings/security" as const, title: "Security", body: "Password and account deletion." },
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Profile and organization changes are saved when you are signed in and the database is configured. Local Postgres does not sign you in by itself."
      />
      <Suspense fallback={<PageSkeleton />}>
        <CurrentOrganizationCard />
      </Suspense>
      <nav aria-label="Settings sections" className="grid gap-3 sm:grid-cols-3">
        {sections.map((item) => (
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
      <SectionBlock title="Appearance" description="Choose how Cognera looks on this device.">
        <AppearanceForm />
      </SectionBlock>
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

const roleOrder: Role[] = ["owner", "admin", "editor", "member"]

async function CurrentOrganizationCard() {
  await connection()
  const access = await requireCrmContext()
  if (!access.ok) return null

  const summary = await getMembershipSummary(access.context.database, {
    organizationId: access.context.organizationId,
    userId: access.context.userId,
  }).catch(() => null)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Current organization</CardTitle>
          <CardDescription>
            Your role here is <span className="font-medium text-foreground">{access.context.role}</span> —{" "}
            {roleDescriptions[access.context.role as Role] ?? "role description unavailable."}
          </CardDescription>
        </div>
        <Badge variant="outline">{summary?.total ?? "?"} member{summary?.total === 1 ? "" : "s"}</Badge>
      </CardHeader>
      {summary ? (
        <CardContent className="flex flex-wrap gap-2">
          {roleOrder
            .filter((role) => summary.byRole[role])
            .map((role) => (
              <span
                key={role}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {summary.byRole[role]} {role}
                {summary.byRole[role] === 1 ? "" : "s"}
              </span>
            ))}
        </CardContent>
      ) : null}
    </Card>
  )
}
