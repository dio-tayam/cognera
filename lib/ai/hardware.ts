import os from "node:os"

export type ModelSuggestion = {
  model: string
  download: string
  reason: string
}

/**
 * Picks a model that fits the machine's memory. Ollama needs roughly the
 * download size in free RAM (or VRAM) plus headroom for the context window.
 * Apple silicon shares memory between CPU and GPU, so total RAM is the guide.
 */
export function suggestModel(totalBytes: number = os.totalmem()): ModelSuggestion {
  const gb = totalBytes / 1024 ** 3
  if (gb < 6) {
    return {
      model: "llama3.2:1b",
      download: "about 1.3 GB",
      reason: `${gb.toFixed(0)} GB RAM: a 1B model keeps the machine responsive.`,
    }
  }
  if (gb < 12) {
    return {
      model: "llama3.2",
      download: "about 2.0 GB",
      reason: `${gb.toFixed(0)} GB RAM: the 3B Llama 3.2 model is a good balance.`,
    }
  }
  if (gb < 24) {
    return {
      model: "llama3.1:8b",
      download: "about 4.9 GB",
      reason: `${gb.toFixed(0)} GB RAM: an 8B model writes noticeably better drafts.`,
    }
  }
  return {
    model: "qwen2.5:14b",
    download: "about 9.0 GB",
    reason: `${gb.toFixed(0)} GB RAM: a 14B model is affordable and stronger at long drafts.`,
  }
}

export function modelRecommendationText(totalBytes?: number): string {
  const suggestion = suggestModel(totalBytes)
  return `Suggested for this machine: ${suggestion.model} (${suggestion.download}). ${suggestion.reason}`
}
