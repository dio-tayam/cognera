import type { ReactNode } from "react"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { AppShell } from "@/components/layout/app-shell"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { getAppAccess } from "@/lib/app/access"
import { getAppDatabase } from "@/lib/db/app"
import { organizationCookie } from "@/lib/org/cookie"
import { isPreviewableRole, rolePreviewCookie } from "@/lib/org/role-preview"
import { listOrganizationsForUser, type MembershipRow } from "@/lib/org/store"
import { getSessionUser } from "@/lib/auth/session-user"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <PageSkeleton />
        </div>
      }
    >
      <DashboardFrame>{children}</DashboardFrame>
    </Suspense>
  )
}

async function DashboardFrame({ children }: { children: ReactNode }) {
  const access = await getAppAccess()
  const { organizations, currentOrganizationId, realRole, previewRole } =
    await organizationSwitcherData()
  const notice =
    access.mode !== "session"
      ? access.notice
      : organizations.length === 0
        ? "Create an organization to get started. Nothing is stored until you do."
        : currentOrganizationId === null
          ? "Choose an organization from the switcher above to see its data."
          : ""
  return (
    <AppShell
      notice={notice}
      email={access.mode === "session" ? access.email : null}
      organizations={organizations}
      currentOrganizationId={currentOrganizationId}
      realRole={realRole}
      previewRole={previewRole}
    >
      {children}
    </AppShell>
  )
}

async function organizationSwitcherData(): Promise<{
  organizations: MembershipRow[]
  currentOrganizationId: string | null
  realRole: string | null
  previewRole: string | null
}> {
  const user = await getSessionUser()
  if (!user)
    return { organizations: [], currentOrganizationId: null, realRole: null, previewRole: null }
  const database = getAppDatabase()
  if (!database)
    return { organizations: [], currentOrganizationId: null, realRole: null, previewRole: null }

  try {
    const organizations = await listOrganizationsForUser(database, user.id)
    const cookieStore = await cookies()
    const requested = cookieStore.get(organizationCookie)?.value
    const current =
      organizations.find((org) => org.id === requested) ??
      (organizations.length === 1 ? organizations[0] : undefined)
    const realRole = current?.role ?? null
    const previewCookie = cookieStore.get(rolePreviewCookie)?.value
    const previewRole = realRole === "owner" && isPreviewableRole(previewCookie) ? previewCookie : null
    return { organizations, currentOrganizationId: current?.id ?? null, realRole, previewRole }
  } catch {
    return { organizations: [], currentOrganizationId: null, realRole: null, previewRole: null }
  }
}
