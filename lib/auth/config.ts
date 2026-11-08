import "server-only"
import { z } from "zod"
import { blankToUndefined } from "@/lib/env/values"

const urlSchema = z.url()

export type SupabaseConfig =
  { state: "disabled"; reason: string } | { state: "invalid"; reason: string } | { state: "ready" }

export function readSupabaseConfig(): SupabaseConfig {
  const url = blankToUndefined(process.env.SUPABASE_URL)
  const anonKey = blankToUndefined(process.env.SUPABASE_ANON_KEY)

  if (!url && !anonKey) {
    return {
      state: "disabled",
      reason:
        "Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in.",
    }
  }
  if (!url || !anonKey) {
    return {
      state: "invalid",
      reason: "Supabase Auth is incomplete. Set both SUPABASE_URL and SUPABASE_ANON_KEY.",
    }
  }
  if (!urlSchema.safeParse(url).success) {
    return { state: "invalid", reason: "SUPABASE_URL is not a valid absolute URL." }
  }
  if (anonKey.length < 20) {
    return { state: "invalid", reason: "SUPABASE_ANON_KEY is too short to be an anon key." }
  }
  return { state: "ready" }
}

export function supabaseCredentials(): { url: string; anonKey: string } | null {
  const config = readSupabaseConfig()
  if (config.state !== "ready") return null
  const url = blankToUndefined(process.env.SUPABASE_URL)
  const anonKey = blankToUndefined(process.env.SUPABASE_ANON_KEY)
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function serviceRoleKeyPresent(): boolean {
  return blankToUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY) !== undefined
}
