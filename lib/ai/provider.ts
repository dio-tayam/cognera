import { OllamaProvider } from "@/lib/ai/ollama"
import type { AiProvider } from "@/lib/ai/types"

/**
 * Returns the configured provider. Ollama is the only provider; there is no
 * fallback to a paid API. Overridable in tests.
 */
let override: AiProvider | null = null

export function getAiProvider(): AiProvider {
  return override ?? new OllamaProvider()
}

export function setAiProviderForTests(provider: AiProvider | null): void {
  override = provider
}
