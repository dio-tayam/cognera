import { transformInstructions, type TransformMode } from "@/lib/ai/catalog"
import { randomBoundary, redactSecrets, systemPrompt, wrapUntrusted } from "@/lib/ai/guard"

/**
 * Single-string prompt for the AI text transformation workflow node. The
 * filled source text comes from triggers, leads, and webhooks, so it is
 * untrusted and goes inside a randomized data block after trusted instructions.
 */
export function workflowTransformPrompt(mode: TransformMode, source: string): string {
  const boundary = randomBoundary()
  const instructions = `${transformInstructions[mode]} Return only the transformed text, with no preface.`
  const data = wrapUntrusted([{ label: "text", content: redactSecrets(source).text }], boundary)
  return `${systemPrompt(instructions)}\n\n${data}\n\nTransformed text:`
}
