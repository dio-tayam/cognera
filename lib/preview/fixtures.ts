export const previewNotice =
  "Preview mode. Supabase Auth is not configured, so you are not signed in. Records marked as development fixtures are sample data in this browser and are not stored."

export const emptyWorkspaceNotice =
  "Signed in. Tenant records are not connected yet, so lists stay empty instead of showing sample data."

export type LeadStatus = "new" | "qualified" | "archived"

export type FixtureLead = {
  id: string
  name: string
  email: string
  company: string
  status: LeadStatus
  updatedAt: string
}

export type FixtureAutomation = {
  id: string
  name: string
  trigger: string
  status: "draft"
  updatedAt: string
  steps: Array<{ id: string; name: string; detail: string }>
}

export type FixtureRun = {
  id: string
  automationId: string
  automation: string
  status: "failed" | "blocked"
  startedAt: string
  detail: string
}

export type FixtureDocument = {
  id: string
  title: string
  status: "draft"
  updatedAt: string
}

export type FixtureMedia = {
  id: string
  filename: string
  type: string
  updatedAt: string
}

export const fixtureLeads: FixtureLead[] = [
  {
    id: "lead-amina",
    name: "Amina Cole",
    email: "amina.cole@example.com",
    company: "Example Studio",
    status: "new",
    updatedAt: "2026-10-01",
  },
  {
    id: "lead-boris",
    name: "Boris Hale",
    email: "boris.hale@example.com",
    company: "Example Studio",
    status: "qualified",
    updatedAt: "2026-10-02",
  },
  {
    id: "lead-chiara",
    name: "Chiara Ito",
    email: "chiara.ito@example.com",
    company: "Example Press",
    status: "new",
    updatedAt: "2026-10-03",
  },
  {
    id: "lead-diego",
    name: "Diego Park",
    email: "diego.park@example.com",
    company: "Example Press",
    status: "archived",
    updatedAt: "2026-10-04",
  },
  {
    id: "lead-elena",
    name: "Elena Ruiz",
    email: "elena.ruiz@example.com",
    company: "Example Goods",
    status: "new",
    updatedAt: "2026-10-05",
  },
  {
    id: "lead-farah",
    name: "Farah Singh",
    email: "farah.singh@example.com",
    company: "Example Goods",
    status: "qualified",
    updatedAt: "2026-10-06",
  },
  {
    id: "lead-gustavo",
    name: "Gustavo Ali",
    email: "gustavo.ali@example.com",
    company: "Example Lab",
    status: "new",
    updatedAt: "2026-10-07",
  },
  {
    id: "lead-hana",
    name: "Hana Berg",
    email: "hana.berg@example.com",
    company: "Example Lab",
    status: "new",
    updatedAt: "2026-10-08",
  },
  {
    id: "lead-ivan",
    name: "Ivan Petrov",
    email: "ivan.petrov@example.com",
    company: "Example North",
    status: "archived",
    updatedAt: "2026-10-09",
  },
  {
    id: "lead-julia",
    name: "Julia Chen",
    email: "julia.chen@example.com",
    company: "Example North",
    status: "qualified",
    updatedAt: "2026-10-10",
  },
  {
    id: "lead-north",
    name: "Northwind Clinic",
    email: "hello@northwind.example",
    company: "Northwind",
    status: "qualified",
    updatedAt: "2026-10-11",
  },
  {
    id: "lead-omar",
    name: "Omar Dias",
    email: "omar.dias@example.com",
    company: "Example South",
    status: "new",
    updatedAt: "2026-10-11",
  },
]

export const fixtureAutomations: FixtureAutomation[] = [
  {
    id: "sample-intake",
    name: "Sample intake",
    trigger: "Manual",
    status: "draft",
    updatedAt: "2026-10-01",
    steps: [
      {
        id: "receive",
        name: "Receive sample event",
        detail: "Development fixture. This step does not run.",
      },
      {
        id: "review",
        name: "Wait for review",
        detail: "Development fixture. This step does not run.",
      },
    ],
  },
  {
    id: "sample-digest",
    name: "Sample digest",
    trigger: "Schedule",
    status: "draft",
    updatedAt: "2026-10-04",
    steps: [
      {
        id: "collect",
        name: "Collect sample items",
        detail: "Development fixture. This step does not run.",
      },
    ],
  },
]

export const fixtureRuns: FixtureRun[] = [
  {
    id: "run-failed",
    automationId: "sample-intake",
    automation: "Sample intake",
    status: "failed",
    startedAt: "2026-10-02T09:00:00.000Z",
    detail: "Development fixture. This run did not execute.",
  },
  {
    id: "run-blocked",
    automationId: "sample-digest",
    automation: "Sample digest",
    status: "blocked",
    startedAt: "2026-10-05T09:00:00.000Z",
    detail: "Development fixture. A schedule was not registered.",
  },
]

export const fixturePages: FixtureDocument[] = [
  { id: "page-home", title: "Sample home", status: "draft", updatedAt: "2026-10-01" },
  { id: "page-about", title: "Sample about", status: "draft", updatedAt: "2026-10-03" },
]

export const fixturePosts: FixtureDocument[] = [
  { id: "post-welcome", title: "Sample welcome", status: "draft", updatedAt: "2026-10-02" },
  { id: "post-notes", title: "Sample notes", status: "draft", updatedAt: "2026-10-06" },
]

export const fixtureMedia: FixtureMedia[] = [
  { id: "media-mark", filename: "sample-mark.svg", type: "image/svg+xml", updatedAt: "2026-10-01" },
  { id: "media-cover", filename: "sample-cover.png", type: "image/png", updatedAt: "2026-10-04" },
]

export type WorkspaceRecords = {
  source: "development-fixture" | "none"
  leads: FixtureLead[]
  automations: FixtureAutomation[]
  runs: FixtureRun[]
  pages: FixtureDocument[]
  posts: FixtureDocument[]
  media: FixtureMedia[]
}

const emptyRecords: WorkspaceRecords = {
  source: "none",
  leads: [],
  automations: [],
  runs: [],
  pages: [],
  posts: [],
  media: [],
}

export function recordsFor(mode: "preview" | "session" | "blocked"): WorkspaceRecords {
  if (mode !== "preview") return emptyRecords
  return {
    source: "development-fixture",
    leads: fixtureLeads,
    automations: fixtureAutomations,
    runs: fixtureRuns,
    pages: fixturePages,
    posts: fixturePosts,
    media: fixtureMedia,
  }
}
