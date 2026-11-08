import type { ReactNode } from "react"
import { Suspense } from "react"
import { AppShell } from "@/components/layout/app-shell"
import { PageSkeleton } from "@/components/layout/page-skeleton"
import { getAppAccess } from "@/lib/app/access"

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
  return (
    <AppShell notice={access.notice} email={access.mode === "session" ? access.email : null}>
      {children}
    </AppShell>
  )
}
