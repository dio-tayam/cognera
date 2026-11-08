import { blankToUndefined } from "@/lib/env/values"

/**
 * Local AI adapter. Talks to an operator-configured Ollama server.
 * The base URL is operator configuration, not customer input, so it may be a
 * private address such as http://localhost:11434. Customer data only reaches
 * the prompt, never the URL, and redirects are refused.
 */
export class LocalAiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "LocalAiError"
    this.retryable = retryable
  }
}

export function localAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const base = blankToUndefined(env.OLLAMA_BASE_URL)
  if (!base) return false
  try {
    const url = new URL(base)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export async function generateLocalText(
  prompt: string,
  options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
): Promise<{ text: string; model: string }> {
  const env = options.env ?? process.env
  const base = blankToUndefined(env.OLLAMA_BASE_URL)
  if (!base || !localAiConfigured(env)) throw new LocalAiError("Local AI is not configured.", false)
  const root = new URL(base)
  const url = new URL("/api/generate", root)
  const model = blankToUndefined(env.OLLAMA_MODEL) ?? "llama3.2"
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 8_000), stream: false }),
      redirect: "manual",
      signal: options.signal,
    })
  } catch {
    throw new LocalAiError("Local AI is unavailable.", true)
  }
  if (response.status >= 300 && response.status < 400) {
    throw new LocalAiError("Local AI redirected the request.", false)
  }
  if (response.status === 429 || response.status >= 500) {
    throw new LocalAiError("Local AI is unavailable.", true)
  }
  if (!response.ok) throw new LocalAiError("Local AI rejected the prompt.", false)
  const body = (await response.json().catch(() => null)) as { response?: unknown } | null
  if (typeof body?.response !== "string") {
    throw new LocalAiError("Local AI returned an unexpected response.", false)
  }
  return { text: body.response.slice(0, 8_000), model }
}
