import { publicErrorDetail } from "@/lib/errors"

type LogValue = string | number | boolean | null

function redact(fields: Record<string, LogValue>): Record<string, LogValue> {
  const hidden = new Set(["email", "phone", "password", "token", "authorization", "cookie"])
  const output: Record<string, LogValue> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (hidden.has(key.toLowerCase())) {
      output[key] = "[redacted]"
      continue
    }
    output[key] = typeof value === "string" ? publicErrorDetail(new Error(value)) : value
  }
  return output
}

export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, LogValue> = {},
): void {
  const line = JSON.stringify({ level, event, ...redact(fields) })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.info(line)
}
