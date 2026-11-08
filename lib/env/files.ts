import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * Loads .env and then .env.local for Node scripts.
 * Existing process environment variables win, matching Next.js.
 */
export function loadEnvFiles(cwd = process.cwd()): void {
  for (const name of [".env", ".env.local"]) {
    const filePath = path.join(cwd, name)
    if (!existsSync(filePath)) continue

    const text = readFileSync(filePath, "utf8")
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue
      const separator = trimmed.indexOf("=")
      if (separator <= 0) continue

      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      if (quoted) value = value.slice(1, -1)
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}
