"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Eye,
  FileText,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  Plug,
  Plus,
  Settings,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { brand } from "@/config/brand"
import { signOutAction } from "@/lib/auth/actions"
import { setRolePreviewAction, switchOrganizationAction } from "@/lib/org/actions"
import { organizationRoles } from "@/lib/org/schema"
import type { MembershipRow } from "@/lib/org/store"
import { breadcrumbsFor, dashboardNav, isNavActive } from "@/lib/navigation"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "cn"
import type { ReactNode } from "react"

const navIcons: Record<string, LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/dashboard/leads": Users,
  "/dashboard/ai": Sparkles,
  "/dashboard/automations": Workflow,
  "/dashboard/runs": History,
  "/dashboard/cms": FileText,
  "/dashboard/analytics": BarChart3,
  "/dashboard/integrations": Plug,
  "/dashboard/settings": Settings,
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {dashboardNav.map((link) => {
        const active = isNavActive(pathname, link.href)
        const Icon = navIcons[link.href] ?? LayoutGrid
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[var(--elevation-1)] ring-1 ring-sidebar-border"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              {active ? <span className="absolute top-2 bottom-2 -left-2 w-1 rounded-full bg-brand" /> : null}
              <Icon className={cn("size-4", active ? "text-brand" : "")} />
              {link.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function roleLabel(role: string | undefined | null): string {
  if (!role) return ""
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: MembershipRow[]
  currentOrganizationId: string | null
}) {
  const current = organizations.find((org) => org.id === currentOrganizationId)
  const [, startTransition] = useTransition()

  if (organizations.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{current?.name ?? "No organization"}</span>
          {current?.role ? (
            <span className="block text-xs text-muted-foreground">{roleLabel(current.role)}</span>
          ) : null}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-sidebar-accent/70"
          />
        }
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{current?.name ?? "Choose organization"}</span>
          {current?.role ? (
            <span className="block truncate text-xs text-muted-foreground">{roleLabel(current.role)}</span>
          ) : null}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal text-muted-foreground">Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              disabled={org.id === currentOrganizationId}
              onClick={() => {
                if (org.id !== currentOrganizationId) startTransition(() => switchOrganizationAction(org.id))
              }}
            >
              <Check className={cn("size-4 shrink-0", org.id === currentOrganizationId ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{roleLabel(org.role)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
            <Plus className="size-4" /> Create organization
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const previewRoles = organizationRoles.filter((role) => role !== "owner")

/**
 * Owner-only: lets the signed-in owner preview the dashboard as a lower role.
 * Backed by `setRolePreviewAction`, which overrides the role used by every
 * permission check in the app (see `requireCrmContext`), not just this menu.
 */
function RolePreviewSwitcher({ previewRole }: { previewRole: string | null }) {
  const [, startTransition] = useTransition()
  const active = previewRole

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-sidebar-accent/70",
              active ? "bg-warning/10 text-warning-foreground" : undefined,
            )}
          />
        }
      >
        <Eye className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {active ? `Previewing: ${roleLabel(active)}` : "Preview as role"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            See the dashboard as
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!active}
            onClick={() => startTransition(() => setRolePreviewAction("owner"))}
          >
            <Check className={cn("size-4 shrink-0", active ? "opacity-0" : "opacity-100")} />
            <span className="flex-1">Owner (you)</span>
          </DropdownMenuItem>
          {previewRoles.map((role) => (
            <DropdownMenuItem
              key={role}
              disabled={role === active}
              onClick={() => startTransition(() => setRolePreviewAction(role))}
            >
              <Check className={cn("size-4 shrink-0", role === active ? "opacity-100" : "opacity-0")} />
              <span className="flex-1">{roleLabel(role)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PreviewBanner({ role }: { role: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b bg-warning/10 px-4 py-2 text-sm leading-6 text-warning-foreground md:px-8"
    >
      <span className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" /> Previewing the dashboard as {roleLabel(role)}.
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setRolePreviewAction("owner"))}
        className="shrink-0 font-medium underline underline-offset-4 disabled:opacity-60"
      >
        Exit preview
      </button>
    </div>
  )
}

export function AppShell({
  notice,
  email,
  organizations,
  currentOrganizationId,
  realRole,
  previewRole,
  children,
}: {
  notice: string
  email: string | null
  organizations: MembershipRow[]
  currentOrganizationId: string | null
  realRole: string | null
  previewRole: string | null
  children: ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const crumbs = breadcrumbsFor(pathname)
  const isOwner = realRole === "owner"

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label={`${brand.shortName} home`} className="text-sidebar-foreground">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-col gap-1 px-3 pb-2">
          <OrganizationSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} />
          {isOwner ? <RolePreviewSwitcher previewRole={previewRole} /> : null}
        </div>
        <nav aria-label="Application" className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="m-3 rounded-2xl border bg-card p-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Local AI</p>
          <p className="mt-1 text-sm leading-6">Runs on Ollama. No API key needed.</p>
          <Link href="/dashboard/ai" className="mt-2 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
            Open workspace
          </Link>
        </div>
        <div className="border-t p-3">
          <Link
            href="/dashboard/settings/security"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
          >
            <Settings className="size-4" /> Account
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                className="md:hidden"
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Open application menu"
                  />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>Application</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-1 px-4 pb-2">
                  <OrganizationSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} />
                  {isOwner ? <RolePreviewSwitcher previewRole={previewRole} /> : null}
                </div>
                <nav aria-label="Application mobile" className="px-4">
                  <ul className="flex flex-col gap-1">
                    {dashboardNav.map((link) => (
                      <li key={link.href}>
                        <SheetClose
                          render={
                            <Link
                              href={link.href}
                              className="block rounded-md px-3 py-2 text-sm font-medium"
                            />
                          }
                          onClick={() => setOpen(false)}
                        >
                          {link.label}
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="mt-4 border-t px-4 pt-4">
                  <form action={signOutAction}>
                    <SheetClose
                      render={
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                        />
                      }
                    >
                      <LogOut className="size-4" /> Sign out
                    </SheetClose>
                  </form>
                </div>
              </SheetContent>
            </Sheet>
            <span className="md:hidden">
              <Logo />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition hover:bg-muted"
                  />
                }
              >
                <span className="size-1.5 shrink-0 rounded-full bg-success" />
                <span className="hidden max-w-40 truncate text-muted-foreground sm:inline">{email ?? "Preview"}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="max-w-56 truncate font-normal text-muted-foreground">
                    {email ?? "Preview"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem render={<Link href="/dashboard/settings/security" />}>
                    <Settings /> Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    render={
                      <form action={signOutAction} className="contents">
                        <button type="submit" className="flex w-full items-center gap-1.5">
                          <LogOut /> Sign out
                        </button>
                      </form>
                    }
                  />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </header>
        {previewRole ? <PreviewBanner role={previewRole} /> : null}
        {notice ? (
          <p
            role="status"
            className="border-b bg-warning/10 px-4 py-2 text-sm leading-6 text-warning-foreground md:px-8"
          >
            {notice}
          </p>
        ) : null}
        <main
          id="content"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 outline-none md:px-8"
        >
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1
                return (
                  <span key={crumb.href} className="contents">
                    <BreadcrumbItem>
                      {last ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink render={<Link href={crumb.href} />}>
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator />}
                  </span>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
          {children}
        </main>
      </div>
    </div>
  )
}
