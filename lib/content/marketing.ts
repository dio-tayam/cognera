export const featureCards = [
  {
    title: "System status",
    body: "The health report checks the app and, when configured, Postgres, migrations, Supabase, and Ollama. Missing services stay blocked.",
    href: "/status",
    state: "Available",
  },
  {
    title: "Sign-in",
    body: "Email and password sign-in uses Supabase Auth. It stays disabled until both the project URL and anon key are set.",
    href: "/login",
    state: "Optional",
  },
  {
    title: "Workflow foundation",
    body: "The server has a TypeScript workflow engine and a database-backed job queue. The application screens do not run them yet.",
    href: "/dashboard/automations",
    state: "Not connected",
  },
  {
    title: "Content screens",
    body: "Pages, posts, and media have places in the application. Publishing and uploads are not stored.",
    href: "/dashboard/cms",
    state: "Not connected",
  },
] as const

export const plans = [
  {
    name: "Foundation",
    price: "Included",
    detail: "Local installation, health checks, and the application shell.",
  },
  {
    name: "Team",
    price: "Not for sale",
    detail: "Shared tenants, invitations, and roles. Invitations are not sent.",
  },
  {
    name: "Operations",
    price: "Not for sale",
    detail: "Saved automations, content publishing, and analytics. Those stores are not connected.",
  },
] as const

export const billingNotice = "Billing is not connected. This plan cannot be purchased."

export const aboutSections = [
  {
    title: "What Cognera is",
    body: "Cognera AI is a multi-tenant automation and content platform. This installation is the secure foundation and the shared interface. It does not invent customer metrics or completed purchases.",
  },
  {
    title: "What works now",
    body: "You can read the product, check system status, and open the application. Sign-in, sign-up, and password reset call Supabase only when that project is configured. Without it, the application opens in a labeled preview.",
  },
  {
    title: "What is not connected",
    body: "Lead storage, automation runs, content publishing, analytics, billing, and team invitations do not have a product database yet. Forms that need those stores report that nothing was saved or sent.",
  },
] as const

export const privacySections = [
  {
    title: "Accounts",
    body: "When Supabase Auth is configured, sign-in, sign-up, and password reset send the email and password you enter to that Supabase project. This application does not put the service-role key in browser code.",
  },
  {
    title: "Preview records",
    body: "Without Supabase Auth, dashboard lists use development fixtures that ship with the interface. Removing one changes only the list in your browser. It is not written to a server.",
  },
  {
    title: "Messages and files",
    body: "The contact form validates what you type and then reports that delivery is not configured. File pickers on the media screen do not upload the file.",
  },
  {
    title: "Operations data",
    body: "Health checks may contact a configured database, Supabase, or Ollama. Connection strings are not shown in the status response. No product analytics are collected by this interface.",
  },
] as const

export const termsSections = [
  {
    title: "This installation",
    body: "These terms describe the Cognera AI interface in this repository. They are not a paid subscription agreement because billing is not connected.",
  },
  {
    title: "No implied completion",
    body: "Disabled controls and blocked results mean the related service is not available. A preview label means the records are fixtures, not your business data.",
  },
  {
    title: "Your configuration",
    body: "You are responsible for the Supabase project, database, and any later hosting you connect. Do not put private keys in client-side environment variables.",
  },
] as const
