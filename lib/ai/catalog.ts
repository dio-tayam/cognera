import { z } from "zod"

/**
 * The fixed set of AI operations. Client-safe: no server imports.
 * Each operation has a validated input schema and form metadata for the workspace.
 */

export const aiOperationIds = [
  "draft_email",
  "lead_summary",
  "lead_classify",
  "blog_outline",
  "article_draft",
  "faq_draft",
  "transform_text",
  "job_description",
] as const
export type AiOperationId = (typeof aiOperationIds)[number]

export const toneOptions = ["professional", "friendly", "concise", "warm"] as const
export const leadLabels = ["hot", "warm", "cold", "support", "spam"] as const
export type LeadLabel = (typeof leadLabels)[number]
export const articleLengths = ["short", "medium", "long"] as const
export const employmentTypes = ["full_time", "part_time", "contract", "internship"] as const
export const workLocations = ["remote", "hybrid", "onsite"] as const

export const transformModes = [
  "rewrite",
  "shorten",
  "expand",
  "formal",
  "friendly",
  "bullets",
  "fix_grammar",
] as const
export type TransformMode = (typeof transformModes)[number]

export const transformInstructions: Record<TransformMode, string> = {
  rewrite: "Rewrite the text so it is clearer, keeping its meaning and facts.",
  shorten: "Shorten the text to roughly half its length, keeping the key facts.",
  expand: "Expand the text with helpful detail, without inventing facts, prices, or promises.",
  formal: "Rewrite the text in a formal, professional tone.",
  friendly: "Rewrite the text in a warm, friendly tone.",
  bullets: "Convert the text into a concise bulleted list.",
  fix_grammar: "Correct spelling, grammar, and punctuation. Change nothing else.",
}

export const transformModeLabels: Record<TransformMode, string> = {
  rewrite: "Rewrite for clarity",
  shorten: "Shorten",
  expand: "Expand",
  formal: "Make formal",
  friendly: "Make friendly",
  bullets: "Turn into bullets",
  fix_grammar: "Fix grammar",
}

const longText = (label: string) =>
  z.string().trim().min(1, `Enter the ${label}.`).max(8_000, `Keep the ${label} under 8,000 characters.`)
const shortText = (label: string, max = 200) =>
  z.string().trim().min(1, `Enter the ${label}.`).max(max, `Keep the ${label} under ${max} characters.`)
const optionalText = (max: number) => z.string().trim().max(max).default("")

export const aiInputSchemas = {
  draft_email: z.object({
    recipient: optionalText(120),
    context: longText("context"),
    goal: shortText("goal", 300),
    tone: z.enum(toneOptions).default("professional"),
  }),
  lead_summary: z.object({ inquiry: longText("inquiry") }),
  lead_classify: z.object({ inquiry: longText("inquiry") }),
  blog_outline: z.object({
    topic: shortText("topic"),
    audience: optionalText(200),
    keywords: optionalText(300),
  }),
  article_draft: z.object({
    topic: shortText("topic"),
    audience: optionalText(200),
    outline: optionalText(6_000),
    length: z.enum(articleLengths).default("medium"),
  }),
  faq_draft: z.object({
    source: longText("source material"),
    count: z.coerce.number().int().min(3).max(10).default(5),
  }),
  transform_text: z.object({
    text: longText("text"),
    mode: z.enum(transformModes).default("rewrite"),
  }),
  job_description: z.object({
    title: shortText("job title"),
    department: optionalText(120),
    location: z.enum(workLocations).default("remote"),
    employmentType: z.enum(employmentTypes).default("full_time"),
    mustHaves: optionalText(2_000),
  }),
} satisfies Record<AiOperationId, z.ZodType>

export type AiInput<O extends AiOperationId> = z.infer<(typeof aiInputSchemas)[O]>

export const aiRunRequestSchema = z.object({
  operation: z.enum(aiOperationIds),
  input: z.record(z.string(), z.unknown()),
})

export type AiField = {
  name: string
  label: string
  kind: "text" | "textarea" | "select" | "number"
  placeholder?: string
  options?: ReadonlyArray<readonly [string, string]>
  required?: boolean
}

export type AiOperationMeta = {
  id: AiOperationId
  label: string
  group: "Leads" | "Content" | "Text"
  description: string
  fields: AiField[]
  example: Record<string, string>
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const aiOperations: AiOperationMeta[] = [
  {
    id: "draft_email",
    label: "Draft email",
    group: "Leads",
    description: "Write a reply you can edit and send yourself. Nothing is sent from here.",
    fields: [
      { name: "recipient", label: "Recipient name", kind: "text", placeholder: "Ana Reyes" },
      {
        name: "context",
        label: "Context",
        kind: "textarea",
        required: true,
        placeholder: "Paste the inquiry or describe the situation.",
      },
      { name: "goal", label: "Goal", kind: "text", required: true, placeholder: "Book a 20-minute discovery call" },
      { name: "tone", label: "Tone", kind: "select", options: toneOptions.map((tone) => [tone, titleCase(tone)] as const) },
    ],
    example: {
      recipient: "Ana Reyes",
      context:
        "Hi! We run three clinics in Cebu and want to automate appointment follow-ups and our blog. Do you support Tagalog content? Budget is flexible.",
      goal: "Book a 20-minute discovery call this week",
      tone: "friendly",
    },
  },
  {
    id: "lead_summary",
    label: "Summarize inquiry",
    group: "Leads",
    description: "Turn a long inquiry into the facts a teammate needs.",
    fields: [{ name: "inquiry", label: "Inquiry", kind: "textarea", required: true, placeholder: "Paste the lead message." }],
    example: {
      inquiry:
        "Hello, I'm Marco from Tala Foods. We have 40 franchise stores and our marketing team spends hours on weekly promos. We'd like automated drafts for social posts and a way to route catering inquiries to the right branch. Could we see a demo before end of month? Our IT team needs data to stay on our servers.",
    },
  },
  {
    id: "lead_classify",
    label: "Classify lead",
    group: "Leads",
    description: "Suggest hot, warm, cold, support, or spam. You decide what to do with it.",
    fields: [{ name: "inquiry", label: "Inquiry", kind: "textarea", required: true, placeholder: "Paste the lead message." }],
    example: {
      inquiry:
        "We're ready to sign this quarter. 120 seats, need SSO and on-prem AI. Can your sales team call me tomorrow at 10am?",
    },
  },
  {
    id: "blog_outline",
    label: "Blog outline",
    group: "Content",
    description: "Structure a post with sections and talking points.",
    fields: [
      { name: "topic", label: "Topic", kind: "text", required: true, placeholder: "Local AI for small clinics" },
      { name: "audience", label: "Audience", kind: "text", placeholder: "Clinic owners" },
      { name: "keywords", label: "Keywords", kind: "text", placeholder: "privacy, automation, follow-ups" },
    ],
    example: {
      topic: "Why small businesses should run AI on their own hardware",
      audience: "Owners of 5–50 person companies",
      keywords: "privacy, cost, Ollama, automation",
    },
  },
  {
    id: "article_draft",
    label: "Article draft",
    group: "Content",
    description: "A first draft in Markdown. Review facts before publishing.",
    fields: [
      { name: "topic", label: "Topic", kind: "text", required: true, placeholder: "Automating lead follow-up" },
      { name: "audience", label: "Audience", kind: "text", placeholder: "Sales managers" },
      { name: "outline", label: "Outline (optional)", kind: "textarea", placeholder: "Paste an outline to follow." },
      {
        name: "length",
        label: "Length",
        kind: "select",
        options: articleLengths.map((length) => [length, titleCase(length)] as const),
      },
    ],
    example: {
      topic: "Five follow-up emails you can automate today",
      audience: "Sales managers at growing teams",
      outline: "",
      length: "short",
    },
  },
  {
    id: "faq_draft",
    label: "FAQ draft",
    group: "Content",
    description: "Questions and answers grounded in your source text.",
    fields: [
      { name: "source", label: "Source material", kind: "textarea", required: true, placeholder: "Paste product notes, policies, or a page." },
      { name: "count", label: "Number of questions", kind: "number", placeholder: "5" },
    ],
    example: {
      source:
        "Cognera runs AI on your own machine through Ollama. No API key or card is needed. Workflows run on a worker you start. Content stays a draft until an editor publishes it. Team roles: owner, admin, editor, member.",
      count: "5",
    },
  },
  {
    id: "transform_text",
    label: "Transform text",
    group: "Text",
    description: "Rewrite, shorten, expand, or change tone. The same modes power the AI transform workflow node.",
    fields: [
      { name: "text", label: "Text", kind: "textarea", required: true, placeholder: "Paste text to transform." },
      {
        name: "mode",
        label: "Mode",
        kind: "select",
        options: transformModes.map((mode) => [mode, transformModeLabels[mode]] as const),
      },
    ],
    example: {
      text: "hey so we got ur message and we can def help with the automations thing, lmk when ur free to talk",
      mode: "formal",
    },
  },
  {
    id: "job_description",
    label: "Job description",
    group: "Content",
    description: "A posting draft with responsibilities and requirements. Review before publishing.",
    fields: [
      { name: "title", label: "Job title", kind: "text", required: true, placeholder: "Senior Backend Engineer" },
      { name: "department", label: "Department", kind: "text", placeholder: "Engineering" },
      {
        name: "location",
        label: "Location",
        kind: "select",
        options: workLocations.map((location) => [location, titleCase(location)] as const),
      },
      {
        name: "employmentType",
        label: "Employment type",
        kind: "select",
        options: employmentTypes.map((type) => [type, titleCase(type.replace("_", "-"))] as const),
      },
      {
        name: "mustHaves",
        label: "Must-haves (optional)",
        kind: "textarea",
        placeholder: "Paste required skills, years of experience, or anything else the role needs.",
      },
    ],
    example: {
      title: "Senior Backend Engineer",
      department: "Engineering",
      location: "remote",
      employmentType: "full_time",
      mustHaves: "5+ years with Postgres and TypeScript. Experience with multi-tenant SaaS is a plus.",
    },
  },
]

export function operationMeta(id: AiOperationId): AiOperationMeta {
  const meta = aiOperations.find((operation) => operation.id === id)
  if (!meta) throw new Error(`Unknown AI operation ${id}`)
  return meta
}

export type AiStructured =
  | { kind: "email"; subject: string; body: string }
  | { kind: "classification"; label: LeadLabel; confidence: number; reason: string }
  | { kind: "outline"; title: string; sections: Array<{ heading: string; points: string[] }> }
  | { kind: "faq"; items: Array<{ question: string; answer: string }> }
  | { kind: "text" }

export type AiRunResult = {
  operation: AiOperationId
  /** Editable Markdown. The person reviewing it decides what happens next. */
  text: string
  structured: AiStructured
  model: string
  durationMs: number
  promptTokens: number | null
  completionTokens: number | null
  warnings: string[]
}

export type AiUsageRow = {
  id: string
  operation: AiOperationId
  model: string
  status: "succeeded" | "failed" | "cancelled"
  errorCode: string | null
  inputChars: number
  outputChars: number
  promptTokens: number | null
  completionTokens: number | null
  durationMs: number
  createdAt: string
}

export type AiUsageSummary = {
  rows: AiUsageRow[]
  totals: { runs: number; succeeded: number; failed: number; outputChars: number; completionTokens: number }
  storage: "database" | "memory"
}

export const warningLabels: Record<string, string> = {
  "input-override-instructions": "The input contains text that tries to override instructions. It was treated as data.",
  "input-role-hijack": "The input tries to assign the assistant a new role. It was treated as data.",
  "input-prompt-extraction": "The input asks for hidden instructions. It was treated as data.",
  "input-fake-boundary": "The input contains prompt-formatting markers. They were treated as data.",
  "input-tool-request": "The input asks to run commands or tools. The assistant has no such access.",
  "input-exfiltration": "The input asks to send data elsewhere. The assistant cannot send anything.",
  "output-echoed-boundary": "The output repeated internal markers. Review it carefully.",
  "output-override-instructions": "The output contains instruction-like text. Review before using it.",
  "output-role-hijack": "The output contains role-change text. Review before using it.",
  "output-tool-request": "The output mentions running commands. Nothing was run.",
  "output-exfiltration": "The output mentions sending data elsewhere. Nothing was sent.",
}

export function describeWarning(code: string): string {
  if (warningLabels[code]) return warningLabels[code]
  if (code.startsWith("redacted-")) return `A ${code.slice(9)} was removed from the input before it reached the model.`
  if (code.startsWith("output-redacted-"))
    return `A ${code.slice(16)} was removed from the output.`
  return code
}
