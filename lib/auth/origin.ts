import "server-only"
import { headers } from "next/headers"

/** Rejects cookie-authenticated mutations whose Origin host does not match the request host. */
export async function mutationOriginAllowed(): Promise<boolean> {
  const headerStore = await headers()
  const origin = headerStore.get("origin")
  if (!origin) return true
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
