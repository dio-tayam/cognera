/**
 * npm run ai:check            Detect Ollama, its server, and installed models.
 * npm run ai:check -- --pull  Offer to download the configured model, after asking.
 *
 * Never downloads a model without an explicit "yes" at the prompt.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import { createInterface } from "node:readline/promises"
import { defaultOllamaModel, defaultOllamaUrl } from "../lib/ai/config"
import { suggestModel } from "../lib/ai/hardware"

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file)
    } catch {
      // A malformed env file is reported by npm run setup:check.
    }
  }
}

const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || ""
const model = process.env.OLLAMA_MODEL?.trim() || defaultOllamaModel
const wantsPull = process.argv.includes("--pull")

function binaryVersion(): string | null {
  try {
    return execFileSync("ollama", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch {
    return null
  }
}

function installInstructions(): string[] {
  switch (os.platform()) {
    case "darwin":
      return [
        "macOS: download the app from https://ollama.com/download/mac",
        "   or: brew install ollama && brew services start ollama",
      ]
    case "win32":
      return [
        "Windows: download OllamaSetup.exe from https://ollama.com/download/windows",
        "     or: winget install Ollama.Ollama",
        "The installer starts Ollama in the background (system tray).",
      ]
    default:
      return [
        "Linux: curl -fsSL https://ollama.com/install.sh | sh",
        "       Read the script first if you prefer: https://ollama.com/install.sh",
        "       The installer registers a systemd service: sudo systemctl enable --now ollama",
      ]
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(4_000), redirect: "manual" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

async function main() {
const totalGb = os.totalmem() / 1024 ** 3
const suggestion = suggestModel()

console.log("Cognera local AI check\n")
console.log(`Machine: ${os.platform()} ${os.arch()}, ${totalGb.toFixed(1)} GB RAM, ${os.cpus().length} CPU threads`)

const version = binaryVersion()
if (version) console.log(`pass: ${version}`)
else {
  console.log("blocked: the ollama command was not found on PATH.")
  console.log("Install Ollama:")
  for (const line of installInstructions()) console.log(`  ${line}`)
}

const target = baseUrl || defaultOllamaUrl
if (!baseUrl) {
  console.log(`blocked: OLLAMA_BASE_URL is not set. AI features stay off until you add it to .env.local.`)
  console.log(`         Typical value: OLLAMA_BASE_URL=${defaultOllamaUrl}`)
}

let installed: string[] = []
let reachable = false
try {
  const tags = (await fetchJson(new URL("/api/tags", target).toString())) as {
    models?: Array<{ name: string; size?: number }>
  }
  reachable = true
  installed = (tags.models ?? []).map((entry) => entry.name)
  console.log(`pass: Ollama server answers at ${target}`)
  console.log(installed.length ? `      Installed models: ${installed.join(", ")}` : "      No models installed yet.")
} catch {
  console.log(`blocked: no Ollama server answered at ${target}.`)
  console.log(
    os.platform() === "linux"
      ? "         Start it with: ollama serve   (or sudo systemctl start ollama)"
      : "         Start it with: ollama serve   (or open the Ollama app)",
  )
}

const hasModel = installed.some((name) => name === model || name === `${model}:latest`)
console.log(`\nConfigured model (OLLAMA_MODEL): ${model}${hasModel ? "  [installed]" : "  [not installed]"}`)
console.log(`Suggested for this machine: ${suggestion.model} (${suggestion.download}). ${suggestion.reason}`)
console.log("Guide: under 6 GB RAM → llama3.2:1b · 8–12 GB → llama3.2 · 16 GB → llama3.1:8b · 32 GB+ → qwen2.5:14b")
console.log("A discrete GPU with enough VRAM, or Apple silicon, makes larger models practical. CPU-only machines should stay small.")

if (!hasModel) {
  console.log(`\nTo download it yourself: ollama pull ${model}`)
  if (wantsPull && reachable && version) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`Download ${model} now? This can take several GB of disk and bandwidth. [y/N] `)
    rl.close()
    if (answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes") {
      await new Promise<void>((resolve) => {
        const child = spawn("ollama", ["pull", model], { stdio: "inherit" })
        child.on("exit", () => resolve())
      })
    } else {
      console.log("Skipped. Nothing was downloaded.")
    }
  } else if (!wantsPull) {
    console.log("Or run: npm run ai:check -- --pull   (asks before downloading)")
  }
}

console.log("\nCognera works without Ollama: AI screens show the connection error and everything else keeps running.")
}
