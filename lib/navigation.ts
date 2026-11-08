export const publicNav = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const

export const publicUtility = [
  { href: "/status", label: "System status" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Sign up" },
] as const

export const footerNav = [
  ...publicNav,
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/status", label: "System status" },
] as const

export const dashboardNav = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/ai", label: "AI workspace" },
  { href: "/dashboard/automations", label: "Automations" },
  { href: "/dashboard/runs", label: "Runs" },
  { href: "/dashboard/cms", label: "Content" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/integrations", label: "Integrations" },
  { href: "/dashboard/settings", label: "Settings" },
] as const

const breadcrumbLabels: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/leads": "Leads",
  "/dashboard/ai": "AI workspace",
  "/dashboard/automations": "Automations",
  "/dashboard/automations/new": "New automation",
  "/dashboard/runs": "Runs",
  "/dashboard/cms": "Content",
  "/dashboard/cms/pages": "Pages",
  "/dashboard/cms/posts": "Posts",
  "/dashboard/cms/media": "Media",
  "/dashboard/analytics": "Analytics",
  "/dashboard/integrations": "Integrations",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/team": "Team",
  "/dashboard/settings/security": "Security",
  "/dashboard/settings/roles": "Roles & permissions",
}

export function breadcrumbsFor(pathname: string): Array<{ href: string; label: string }> {
  if (pathname === "/dashboard") return [{ href: "/dashboard", label: "Overview" }]

  const known = breadcrumbLabels[pathname]
  if (known) {
    const parts = pathname.split("/").filter(Boolean)
    const crumbs: Array<{ href: string; label: string }> = []
    let href = ""
    for (const part of parts) {
      href += `/${part}`
      crumbs.push({ href, label: breadcrumbLabels[href] ?? part })
    }
    return crumbs
  }

  if (pathname.startsWith("/dashboard/automations/")) {
    return [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/automations", label: "Automations" },
      { href: pathname, label: "Automation" },
    ]
  }

  return [{ href: "/dashboard", label: "Overview" }]
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}
