import { z } from "zod"
import {
  aiInputSchemas,
  leadLabels,
  transformInstructions,
  type AiInput,
  type AiOperationId,
  type AiRunResult,
  type AiStructured,
} from "@/lib/ai/catalog"
import { extractJson, sanitizeModelOutput } from "@/lib/ai/guard"
import { AiError, type AiProvider, type CallOptions, type GenerateResult } from "@/lib/ai/types"

const clean = (value: string, max: number) => sanitizeModelOutput(value, max)

const emailShape = z.object({ subject: z.string().min(1).max(300), body: z.string().min(1).max(8_000) })
const outlineShape = z.object({
  title: z.string().min(1).max(300),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(300),
        points: z.array(z.string().max(500)).max(12).default([]),
      }),
    )
    .min(1)
    .max(15),
})
const faqShape = z.object({
  items: z
    .array(z.object({ question: z.string().min(1).max(500), answer: z.string().min(1).max(2_000) }))
    .min(1)
    .max(12),
})

function parseStructured<T>(schema: z.ZodType<T>, text: string): T {
  const parsed = schema.safeParse(extractJson(text))
  if (!parsed.success) {
    throw new AiError("invalid_output", "The model's answer did not match the expected format. Try again.", {
      retryable: true,
    })
  }
  return parsed.data
}

export function validateAiInput<O extends AiOperationId>(
  operation: O,
  input: unknown,
): { ok: true; input: AiInput<O> } | { ok: false; message: string } {
  const parsed = aiInputSchemas[operation].safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the input." }
  return { ok: true, input: parsed.data as AiInput<O> }
}

export function inputSize(input: Record<string, unknown>): number {
  return Object.values(input).reduce<number>(
    (total, value) => total + (typeof value === "string" ? value.length : 0),
    0,
  )
}

function finish(
  operation: AiOperationId,
  result: GenerateResult,
  text: string,
  structured: AiStructured,
): AiRunResult {
  return {
    operation,
    text,
    structured,
    model: result.model,
    durationMs: result.durationMs,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    warnings: result.warnings,
  }
}

/** Builds the trusted instruction text and untrusted data for a transform. Shared with the workflow node. */
export function transformRequest(mode: keyof typeof transformInstructions, text: string) {
  return {
    instructions: `${transformInstructions[mode]} Return only the transformed text, with no preface.`,
    data: [{ label: "text", content: text }],
  }
}

export async function runAiOperation(
  provider: AiProvider,
  operation: AiOperationId,
  rawInput: unknown,
  options: CallOptions = {},
): Promise<AiRunResult> {
  const valid = validateAiInput(operation, rawInput)
  if (!valid.ok) throw new AiError("invalid_input", valid.message)

  switch (operation) {
    case "draft_email": {
      const input = valid.input as AiInput<"draft_email">
      const result = await provider.generateText(
        {
          instructions: [
            "Draft an email reply for a person to review and send themselves.",
            `Tone: ${input.tone}. Goal (set by the sender): ${input.goal}.`,
            input.recipient ? `Address the recipient as ${input.recipient}.` : "Use a neutral greeting.",
            "Do not invent prices, dates, guarantees, or facts that are not in the context. Use [placeholders] for anything the sender must fill in.",
            'Respond with JSON only: {"subject": string, "body": string}. The body is plain text with line breaks.',
          ].join("\n"),
          data: [{ label: "context", content: input.context }],
          format: "json",
        },
        options,
      )
      const email = parseStructured(emailShape, result.text)
      const subject = clean(email.subject, 300)
      const body = clean(email.body, 8_000)
      return finish(operation, result, `Subject: ${subject}\n\n${body}`, { kind: "email", subject, body })
    }
    case "lead_summary": {
      const input = valid.input as AiInput<"lead_summary">
      const result = await provider.summarizeText(
        {
          text: input.inquiry,
          focus: "who is asking, what they need, size or budget, timeline, constraints, and the next step they request",
          maxWords: 120,
        },
        options,
      )
      return finish(operation, result, result.text, { kind: "text" })
    }
    case "lead_classify": {
      const input = valid.input as AiInput<"lead_classify">
      const result = await provider.classifyText(
        {
          text: input.inquiry,
          labels: leadLabels,
          guidance:
            "hot: clear buying intent with timeline or budget. warm: interested but early. cold: vague or unlikely to buy. support: an existing customer needing help. spam: unsolicited promotion, phishing, or nonsense.",
        },
        options,
      )
      const percent = Math.round(result.confidence * 100)
      return finish(
        operation,
        result,
        `Suggested label: ${result.label} (${percent}% confidence)\n\n${result.reason}\n\nThis is a suggestion. The lead's status is unchanged until someone updates it.`,
        { kind: "classification", label: result.label, confidence: result.confidence, reason: result.reason },
      )
    }
    case "blog_outline": {
      const input = valid.input as AiInput<"blog_outline">
      const result = await provider.generateText(
        {
          instructions: [
            "Create a blog post outline with 4 to 7 sections and 2 to 4 talking points each.",
            'Respond with JSON only: {"title": string, "sections": [{"heading": string, "points": [string]}]}.',
          ].join("\n"),
          data: [
            { label: "topic", content: input.topic },
            ...(input.audience ? [{ label: "audience", content: input.audience }] : []),
            ...(input.keywords ? [{ label: "keywords", content: input.keywords }] : []),
          ],
          format: "json",
        },
        options,
      )
      const outline = parseStructured(outlineShape, result.text)
      const title = clean(outline.title, 300)
      const sections = outline.sections.map((section) => ({
        heading: clean(section.heading, 300),
        points: section.points.map((point) => clean(point, 500)).filter(Boolean),
      }))
      const text = [
        `# ${title}`,
        ...sections.map((section) =>
          [`## ${section.heading}`, ...section.points.map((point) => `- ${point}`)].join("\n"),
        ),
      ].join("\n\n")
      return finish(operation, result, text, { kind: "outline", title, sections })
    }
    case "article_draft": {
      const input = valid.input as AiInput<"article_draft">
      const words = { short: 400, medium: 800, long: 1_200 }[input.length]
      const result = await provider.generateText(
        {
          instructions: [
            `Write a blog article draft of about ${words} words in Markdown with a title and section headings.`,
            "Mark any statistic or claim that needs a source with [citation needed]. Do not invent quotes.",
            input.outline ? "Follow the provided outline." : "",
          ]
            .filter(Boolean)
            .join("\n"),
          data: [
            { label: "topic", content: input.topic },
            ...(input.audience ? [{ label: "audience", content: input.audience }] : []),
            ...(input.outline ? [{ label: "outline", content: input.outline }] : []),
          ],
          temperature: 0.6,
        },
        options,
      )
      return finish(operation, result, result.text, { kind: "text" })
    }
    case "faq_draft": {
      const input = valid.input as AiInput<"faq_draft">
      const result = await provider.generateText(
        {
          instructions: [
            `Write ${input.count} frequently asked questions with answers, using only facts in the source material.`,
            "If the source does not answer something, do not include that question.",
            'Respond with JSON only: {"items": [{"question": string, "answer": string}]}.',
          ].join("\n"),
          data: [{ label: "source", content: input.source }],
          format: "json",
        },
        options,
      )
      const faq = parseStructured(faqShape, result.text)
      const items = faq.items.map((item) => ({
        question: clean(item.question, 500),
        answer: clean(item.answer, 2_000),
      }))
      const text = items.map((item) => `**${item.question}**\n\n${item.answer}`).join("\n\n")
      return finish(operation, result, text, { kind: "faq", items })
    }
    case "transform_text": {
      const input = valid.input as AiInput<"transform_text">
      const result = await provider.generateText(transformRequest(input.mode, input.text), options)
      return finish(operation, result, result.text, { kind: "text" })
    }
  }
}
