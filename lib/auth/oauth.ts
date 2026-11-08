import "server-only"
import { readSupabaseConfig, supabaseCredentials } from "@/lib/auth/config"

export type GoogleAuthStatus = { available: true } | { available: false; reason: string }

let cached: { at: number; status: GoogleAuthStatus } | null = null
const ttlMs = 5 * 60_000

/**
 * Google sign-in runs through Supabase Auth. Supabase's public settings
 * endpoint says whether the Google provider is enabled, so the button can
 * explain a disabled provider instead of sending people to a raw error page.
 */
export async function googleAuthStatus(): Promise<GoogleAuthStatus> {
  const config = readSupabaseConfig()
  if (config.state !== "ready") return { available: false, reason: config.reason }
  if (cached && Date.now() - cached.at < ttlMs) return cached.status
  const credentials = supabaseCredentials()
  if (!credentials) return { available: false, reason: "Supabase Auth is not configured." }
  let status: GoogleAuthStatus
  try {
    const response = await fetch(new URL("/auth/v1/settings", credentials.url), {
      headers: { apikey: credentials.anonKey },
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    })
    const body = (await response.json().catch(() => null)) as { external?: { google?: boolean } } | null
    status = body?.external?.google
      ? { available: true }
      : {
          available: false,
          reason: "Google is not enabled in Supabase. Turn it on under Authentication → Providers → Google.",
        }
  } catch {
    // Unknown is not "off": let the person try, and Supabase reports the result.
    return { available: true }
  }
  cached = { at: Date.now(), status }
  return status
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback
  if (value.length > 300 || /[\r\n]/.test(value)) return fallback
  return value
}
