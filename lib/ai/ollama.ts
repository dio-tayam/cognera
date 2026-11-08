import { z } from "zod"
import { aiLimits, readOllamaSettings, type OllamaSettings } from "@/lib/ai/config"
import {
  detectInjectionSignals,
  extractJson,
  randomBoundary,
  redactSecrets,
  sanitizeModelOutput,
  systemPrompt,
  wrapUntrusted,
} from "@/lib/ai/guard"
import { modelRecommendationText } from "@/lib/ai/hardware"
import {
  AiError,
  type AiHealth,
  type AiProvider,
  type CallOptions,
  type ClassifyRequest,
  type ClassifyResult,
  type GenerateRequest,
  type GenerateResult,
  type SummarizeRequest,
} from "@/lib/ai/types"

/**
 * Ollama adapter. The base URL is operator configuration, not customer input,
 * so it may be a private address such as http://127.0.0.1:11434. Customer data
 * only reaches the request body, never the URL, and redirects are refused.
 * Models are never pulled from here; downloading is an explicit operator step.
 */

const chatResponse = z.object({
  message: z.object({ content: z.string() }),
  model: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
})

const tagsResponse = z.object({
  models: z.array(z.object({ name: z.string(), size: z.number().optional() })).default([]),
})

const versionResponse = z.object({ version: z.string() })

const classifyShape = z.object({
  label: z.string(),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  reason: z.string().max(600).catch(""),
})

export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const
  private readonly settings: OllamaSettings

  constructor(settings: OllamaSettings = readOllamaSettings()) {
    this.settings = settings
  }

  get model(): string {
    return this.settings.model
  }

  async generateText(request: GenerateRequest, options: CallOptions = {}): Promise<GenerateResult> {
    const base = this.requireBase()
    const instructions = request.instructions.trim()
    if (!instructions) throw new AiError("invalid_input", "Instructions are required.")

    const warnings = new Set<string>()
    const parts = (request.data ?? []).map((part) => {
      const cleaned = redactSecrets(part.content)
      for (const name of cleaned.redacted) warnings.add(`redacted-${name}`)
      for (const signal of detectInjectionSignals(cleaned.text)) warnings.add(`input-${signal}`)
      return { label: part.label, content: cleaned.text }
    })
    const inputChars = parts.reduce((total, part) => total + part.content.length, 0)
    if (inputChars > aiLimits.maxInputChars) {
      throw new AiError(
        "invalid_input",
        `The input is ${inputChars.toLocaleString("en-US")} characters. The limit is ${aiLimits.maxInputChars.toLocaleString("en-US")}.`,
      )
    }

    const boundary = randomBoundary()
    const messages = [
      { role: "system", content: systemPrompt(instructions) },
      {
        role: "user",
        content: parts.length
          ? `${wrapUntrusted(parts, boundary)}\n\nComplete the task using the data above.`
          : "Complete the task.",
      },
    ]

    const started = Date.now()
    const response = await this.request(
      new URL("/api/chat", base),
      {
        method: "POST",
        body: JSON.stringify({
          model: this.settings.model,
          messages,
          stream: false,
          format: request.format === "json" ? "json" : undefined,
          options: {
            num_predict: aiLimits.maxOutputTokens,
            temperature: request.temperature ?? 0.4,
          },
        }),
      },
      options,
    )
    const parsed = chatResponse.safeParse(await response.json().catch(() => null))
    if (!parsed.success) {
      throw new AiError("invalid_output", "Ollama returned a response in an unexpected shape.")
    }

    const maxChars = Math.min(request.maxOutputChars ?? aiLimits.maxOutputChars, aiLimits.maxOutputChars)
    const raw = parsed.data.message.content
    if (raw.includes(boundary)) warnings.add("output-echoed-boundary")
    for (const signal of detectInjectionSignals(raw)) warnings.add(`output-${signal}`)
    const outputSecrets = redactSecrets(raw)
    for (const name of outputSecrets.redacted) warnings.add(`output-redacted-${name}`)
    const text =
      request.format === "json"
        ? outputSecrets.text.slice(0, maxChars)
        : sanitizeModelOutput(outputSecrets.text, maxChars)
    if (!text) throw new AiError("invalid_output", "The model returned an empty response.", { retryable: true })

    return {
      text,
      model: parsed.data.model ?? this.settings.model,
      durationMs: Date.now() - started,
      usage: {
        promptTokens: parsed.data.prompt_eval_count ?? null,
        completionTokens: parsed.data.eval_count ?? null,
      },
      warnings: [...warnings],
    }
  }

  summarizeText(request: SummarizeRequest, options?: CallOptions): Promise<GenerateResult> {
    const words = Math.min(Math.max(request.maxWords ?? 120, 20), 400)
    return this.generateText(
      {
        instructions: [
          `Summarize the data in at most ${words} words.`,
          "Use plain sentences. State only facts present in the data. If something is unclear, say so.",
          request.focus ? `Focus on: ${request.focus}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        data: [{ label: "text", content: request.text }],
        temperature: 0.2,
      },
      options,
    )
  }

  async classifyText<L extends string>(
    request: ClassifyRequest<L>,
    options?: CallOptions,
  ): Promise<ClassifyResult<L>> {
    if (request.labels.length < 2) throw new AiError("invalid_input", "Provide at least two labels.")
    const result = await this.generateText(
      {
        instructions: [
          `Classify the data into exactly one of these labels: ${request.labels.join(", ")}.`,
          request.guidance ?? "",
          'Respond with JSON only: {"label": string, "confidence": number between 0 and 1, "reason": one short sentence}.',
        ]
          .filter(Boolean)
          .join("\n"),
        data: [{ label: "text", content: request.text }],
        format: "json",
        temperature: 0,
        maxOutputChars: 2_000,
      },
      options,
    )
    const shape = classifyShape.safeParse(extractJson(result.text))
    if (!shape.success) throw new AiError("invalid_output", "The model did not return a classification.", { retryable: true })
    const label = request.labels.find(
      (candidate) => candidate.toLowerCase() === shape.data.label.trim().toLowerCase(),
    )
    if (!label) {
      throw new AiError("invalid_output", "The model returned a label outside the allowed list.", {
        retryable: true,
      })
    }
    return {
      ...result,
      label,
      confidence: shape.data.confidence,
      reason: sanitizeModelOutput(shape.data.reason, 600),
    }
  }

  async checkHealth(options: CallOptions = {}): Promise<AiHealth> {
    const checkedAt = new Date().toISOString()
    const base = this.settings.baseUrl
    const common = {
      provider: "ollama" as const,
      model: this.settings.model,
      checkedAt,
    }
    if (!base) {
      return {
        ...common,
        status: "not_configured",
        message: `${this.settings.problem ?? "Ollama is not configured."} AI features are off; the rest of Cognera works normally.`,
        hint: "Install Ollama, start it, then set OLLAMA_BASE_URL=http://127.0.0.1:11434. Run npm run ai:check for guidance.",
        baseUrl: null,
        version: null,
        installedModels: [],
        latencyMs: null,
      }
    }
    const started = Date.now()
    const timeoutMs = options.timeoutMs ?? aiLimits.healthTimeoutMs
    try {
      const isOllamaCloud = base.hostname === "ollama.com"
      const [versionRes, tagsRes] = await Promise.all([
        isOllamaCloud
          ? Promise.resolve(null)
          : this.request(new URL("/api/version", base), { method: "GET" }, { ...options, timeoutMs }),
        this.request(new URL("/api/tags", base), { method: "GET" }, { ...options, timeoutMs }),
      ])
      const version = versionRes
        ? versionResponse.safeParse(await versionRes.json().catch(() => null))
        : null
      const tags = tagsResponse.safeParse(await tagsRes.json().catch(() => null))
      const installedModels = tags.success ? tags.data.models.map((model) => model.name).slice(0, 50) : []
      const latencyMs = Date.now() - started
      const hasModel = installedModels.some((name) => modelMatches(name, this.settings.model))
      return {
        ...common,
        status: hasModel ? "ready" : "model_missing",
        message: hasModel
          ? isOllamaCloud
            ? `Ollama Cloud can use ${this.settings.model}.`
            : `Ollama is running and ${this.settings.model} is installed.`
          : isOllamaCloud
            ? `${this.settings.model} is not available in your Ollama Cloud model list.`
            : `Ollama is running, but ${this.settings.model} is not installed.`,
        hint: hasModel
          ? null
          : isOllamaCloud
            ? "Set OLLAMA_MODEL to a model name returned by Ollama Cloud."
            : `Download it yourself with: ollama pull ${this.settings.model}. Cognera never downloads models automatically. ${modelRecommendationText()}`,
        baseUrl: base.origin,
        version: version?.success ? version.data.version : null,
        installedModels,
        latencyMs,
      }
    } catch (error) {
      const message = error instanceof AiError ? error.message : "Ollama could not be reached."
      return {
        ...common,
        status: "unreachable",
        message: `${message} AI features are paused; nothing was sent to another provider.`,
        hint:
          base.hostname === "ollama.com"
            ? "Check that OLLAMA_API_KEY is valid and Ollama Cloud is available."
            : `Start Ollama (run "ollama serve" or open the Ollama app) and confirm it listens at ${base.origin}.`,
        baseUrl: base.origin,
        version: null,
        installedModels: [],
        latencyMs: null,
      }
    }
  }

  private requireBase(): URL {
    if (!this.settings.baseUrl) {
      throw new AiError("not_configured", this.settings.problem ?? "Ollama is not configured.", {
        hint: "Set OLLAMA_BASE_URL and OLLAMA_MODEL. Ollama Cloud also needs OLLAMA_API_KEY.",
      })
    }
    return this.settings.baseUrl
  }

  private async request(url: URL, init: RequestInit, options: CallOptions): Promise<Response> {
    if (options.signal?.aborted) throw new AiError("cancelled", "The request was cancelled.")
    const timeoutMs = options.timeoutMs ?? this.settings.timeoutMs
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(this.settings.apiKey ? { authorization: `Bearer ${this.settings.apiKey}` } : {}),
        },
        redirect: "manual",
        cache: "no-store",
        signal,
      })
    } catch {
      if (options.signal?.aborted) throw new AiError("cancelled", "The request was cancelled.")
      if (timeout.aborted) {
        throw new AiError("timeout", `Ollama did not answer within ${Math.round(timeoutMs / 1000)} seconds.`, {
          retryable: true,
          hint: "A smaller model or shorter input responds faster. AI_TIMEOUT_MS raises the limit.",
        })
      }
      throw new AiError("unavailable", "Ollama could not be reached.", {
        retryable: true,
        hint: "Start Ollama and check OLLAMA_BASE_URL.",
      })
    }
    if (response.status >= 300 && response.status < 400) {
      throw new AiError("rejected", "Ollama redirected the request. Redirects are refused.")
    }
    if (response.status === 404) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (typeof body?.error === "string" && body.error.includes("not found")) {
        throw new AiError("model_missing", `The model ${this.settings.model} is not installed.`, {
          hint: `Run: ollama pull ${this.settings.model}. Cognera does not download models automatically.`,
        })
      }
      throw new AiError("rejected", "Ollama does not recognize this endpoint. Update Ollama.")
    }
    if (response.status === 429 || response.status >= 500) {
      throw new AiError("unavailable", "Ollama is busy or failed to answer.", { retryable: true })
    }
    if (!response.ok) throw new AiError("rejected", "Ollama rejected the request.")
    return response
  }
}

function modelMatches(installed: string, wanted: string): boolean {
  if (installed === wanted) return true
  return !wanted.includes(":") && installed === `${wanted}:latest`
}
