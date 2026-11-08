import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

const root = process.cwd()
const obsolete = /\b(vantyqo|orqestra|flowpilot)\b/i
const skipDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
])
const allowedMentions = new Set([
  path.join(root, "docs", "MIGRATION_INVENTORY.md"),
  path.join(root, "tests", "branding.test.ts"),
  path.join(root, "tests", "e2e", "foundation.spec.ts"),
])

function filesUnder(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (skipDirectories.has(entry)) continue
    const fullPath = path.join(directory, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      found.push(...filesUnder(fullPath))
      continue
    }
    found.push(fullPath)
  }
  return found
}

describe("branding", () => {
  test("keeps obsolete product names out of application files", () => {
    const roots = ["app", "components", "config", "lib", "scripts", "db", "tests", "docs"].map(
      (name) => path.join(root, name),
    )
    const extras = [
      "package.json",
      "README.md",
      "Dockerfile",
      "docker-compose.yml",
      ".env.example",
    ].map((name) => path.join(root, name))
    const hits: string[] = []
    for (const file of [...roots.flatMap((directory) => filesUnder(directory)), ...extras]) {
      if (allowedMentions.has(file)) continue
      if (!statSync(file).isFile()) continue
      const text = readFileSync(file, "utf8")
      if (obsolete.test(text)) hits.push(path.relative(root, file))
    }
    expect(hits).toEqual([])
  })
})
