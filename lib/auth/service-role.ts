import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role client for trusted server operations such as account deletion.
 * Do not import this from browser code or ordinary user-scoped reads.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
