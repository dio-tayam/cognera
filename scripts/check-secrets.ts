import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const skipDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
  "dist",
  "out",
])

const patterns: Array<{ name: string; expression: RegExp }> = [
  { name: "private key", expression: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: "AWS access key", expression: /AKIA[0-9A-Z]{16}/ },
  { name: "Stripe live key", expression: /sk_live_[0-9a-zA-Z]{8,}/ },
  { name: "GitHub token", expression: /ghp_[0-9a-zA-Z]{20,}/ },
  { name: "Slack token", expression: /xox[baprs]-[0-9a-zA-Z-]{10,}/ },
  {
    name: "service role JWT",
    expression: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
]

const findings: string[] = []

function walk(directory: string): void {
  for (const entry of readdirSync(directory)) {
    if (skipDirectories.has(entry)) continue
    const fullPath = path.join(directory, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (stat.size > 1_000_000) continue
    const relative = path.relative(root, fullPath)
    if (relative === "package-lock.json") continue
    if (entry === ".env" || (entry.startsWith(".env.") && entry !== ".env.example")) {
      findings.push(`${relative}: environment file should not be committed`)
    }
    const text = readFileSync(fullPath, "utf8")
    for (const pattern of patterns) {
      if (pattern.expression.test(text)) {
        findings.push(`${relative}: matched ${pattern.name}`)
      }
    }
  }
}

walk(root)

if (findings.length > 0) {
  for (const finding of findings) console.error(`failed: ${finding}`)
  process.exit(1)
}

console.log("pass: no private keys, live tokens, or committed environment files were found.")
