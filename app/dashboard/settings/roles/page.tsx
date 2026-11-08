import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { RolesMatrix } from "@/components/marketing/roles-matrix"
import { getAppAccess } from "@/lib/app/access"
import { isRole, type Role } from "@/lib/auth/permissions"
import { requireCrmContext } from "@/lib/crm/context"

export const metadata: Metadata = { title: "Roles & permissions" }

export default function RolesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Roles & permissions"
        description="What each role can do in this organization. The app checks these before every action, and database row-level security enforces them again."
      />
      <Suspense fallback={<PageSkeleton />}>
        <RolesContent />
      </Suspense>
    </>
  )
}

async function RolesContent() {
  const access = await getAppAccess()
  let role: Role | null = null
  let note: string
  if (access.mode === "preview") {
    note = "Preview mode: there is no signed-in user, so no role is highlighted."
  } else {
    const crm = await requireCrmContext()
    role = crm.ok && isRole(crm.context.role) ? crm.context.role : null
    note = role ? `You are ${role === "admin" || role === "owner" ? "an" : "a"} ${role} in the current organization.` : "Choose or create an organization to see your role."
  }
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="rounded-2xl border bg-card px-4 py-3 text-sm">
        {note}{" "}
        <Link href="/dashboard/settings/team" className="font-medium text-primary underline-offset-4 hover:underline">
          Manage team roles
        </Link>
      </p>
      <RolesMatrix currentRole={role} />
    </div>
  )
}
