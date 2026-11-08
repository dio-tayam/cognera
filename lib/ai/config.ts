import { blankToUndefined } from "@/lib/env/values"

export const aiLimits = {
  /** Characters of untrusted input accepted per request, across all parts. */
  maxInputChars: 12_000,
  /** Characters of model output kept. Longer output is cut. */
  maxOutputChars: 12_000,
  /** Tokens Ollama may generate per call. */
  maxOutputTokens: 1_536,
  defaultTimeoutMs: 90_000,
  minTimeoutMs: 5_000,
  maxTimeoutMs: 300_000,
  healthTimeoutMs: 4_000,
  /** Concurrent generations per organization, to protect a local model server. */
  maxConcurrentPerOrg: 2,
} as const

export const defaultOllamaModel = "llama3.2"
export const defaultOllamaUrl = "http://127.0.0.1:11434"

export type OllamaSettings = {
  baseUrl: URL | null
  /** Why baseUrl is null, if it is. */
  problem: string | null
  model: string
  timeoutMs: number
}

export function readOllamaSettings(env: NodeJS.ProcessEnv = process.env): OllamaSettings {
  const model = blankToUndefined(env.OLLAMA_MODEL) ?? defaultOllamaModel
  const timeoutMs = clampTimeout(Number.parseInt(env.AI_TIMEOUT_MS ?? "", 10))
  const raw = blankToUndefined(env.OLLAMA_BASE_URL)
  if (!raw) {
    return {
      baseUrl: null,
      problem: "OLLAMA_BASE_URL is not set.",
      model,
      timeoutMs,
    }
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { baseUrl: null, problem: "OLLAMA_BASE_URL must use http or https.", model, timeoutMs }
    }
    if (url.username || url.password) {
      return {
        baseUrl: null,
        problem: "OLLAMA_BASE_URL must not contain credentials.",
        model,
        timeoutMs,
      }
    }
    return { baseUrl: url, problem: null, model, timeoutMs }
  } catch {
    return { baseUrl: null, problem: "OLLAMA_BASE_URL is not a valid URL.", model, timeoutMs }
  }
}

function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return aiLimits.defaultTimeoutMs
  return Math.min(aiLimits.maxTimeoutMs, Math.max(aiLimits.minTimeoutMs, value))
}

export const modelValidPattern = /^[A-Za-z0-9._:/-]{1,120}$/
