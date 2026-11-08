/**
 * Provider-neutral AI contract. Ollama is the default and only bundled
 * implementation. No paid inference API or API key is required, and the
 * application never switches to another provider when this one fails.
 */

export type AiErrorCode =
  | "not_configured"
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "model_missing"
  | "rejected"
  | "invalid_input"
  | "invalid_output"
  | "busy"

export class AiError extends Error {
  readonly code: AiErrorCode
  readonly retryable: boolean
  /** Operator-facing next step, safe to show in the interface. */
  readonly hint: string | null

  constructor(code: AiErrorCode, message: string, options: { retryable?: boolean; hint?: string } = {}) {
    super(message)
    this.name = "AiError"
    this.code = code
    this.retryable = options.retryable ?? false
    this.hint = options.hint ?? null
  }

  get status(): number {
    switch (this.code) {
      case "invalid_input":
        return 400
      case "cancelled":
        return 499
      case "busy":
        return 429
      case "timeout":
        return 504
      case "invalid_output":
      case "rejected":
        return 502
      default:
        return 503
    }
  }
}

/** A labeled block of data the model must treat as content, never as instructions. */
export type UntrustedPart = { label: string; content: string }

export type CallOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export type GenerateRequest = {
  /** Trusted, application-authored instructions. Never put user text here. */
  instructions: string
  /** Untrusted data: user input, CRM records, documents, retrieved content. */
  data?: UntrustedPart[]
  format?: "text" | "json"
  maxOutputChars?: number
  temperature?: number
}

export type TokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
}

export type GenerateResult = {
  text: string
  model: string
  durationMs: number
  usage: TokenUsage
  /** Signals found in the untrusted input or the output. Informational, not a guarantee. */
  warnings: string[]
}

export type SummarizeRequest = {
  text: string
  focus?: string
  maxWords?: number
}

export type ClassifyRequest<L extends string> = {
  text: string
  labels: readonly L[]
  /** Trusted description of what each label means. */
  guidance?: string
}

export type ClassifyResult<L extends string> = GenerateResult & {
  label: L
  confidence: number
  reason: string
}

export type AiHealthStatus = "ready" | "model_missing" | "unreachable" | "not_configured"

export type AiHealth = {
  provider: "ollama"
  status: AiHealthStatus
  message: string
  hint: string | null
  baseUrl: string | null
  model: string
  version: string | null
  installedModels: string[]
  latencyMs: number | null
  checkedAt: string
}

export interface AiProvider {
  readonly id: "ollama"
  readonly model: string
  generateText(request: GenerateRequest, options?: CallOptions): Promise<GenerateResult>
  summarizeText(request: SummarizeRequest, options?: CallOptions): Promise<GenerateResult>
  classifyText<L extends string>(
    request: ClassifyRequest<L>,
    options?: CallOptions,
  ): Promise<ClassifyResult<L>>
  checkHealth(options?: CallOptions): Promise<AiHealth>
}
