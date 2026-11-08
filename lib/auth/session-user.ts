import "server-only"
import { readSupabaseConfig } from "@/lib/auth/config"
import { sessionExpired } from "@/lib/auth/session-expiry"
import { createSupabaseServerClient } from "@/lib/auth/supabase"

export type SessionUser = { id: string; email: string }

/** The signed-in Supabase user. Local Postgres does not create this session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (readSupabaseConfig().state !== "ready") return null
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data } = await supabase.auth.getUser()
  if (!data.user) return null

  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionExpired(sessionData.session?.expires_at, Date.now())) return null

  return { id: data.user.id, email: data.user.email ?? "" }
}
