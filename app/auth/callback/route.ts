import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { safeNextPath } from "@/lib/auth/oauth"
import { createSupabaseServerClient } from "@/lib/auth/supabase"
import { logEvent } from "@/lib/log/logger"
import { getSiteConfig } from "@/lib/site"

const otpTypes = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"])

/**
 * Finishes every Supabase redirect flow: Google OAuth (?code=), email
 * confirmation, and password recovery (?code= or ?token_hash=&type=).
 */
export async function GET(request: Request) {
  const site = getSiteConfig()
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get("next"))
  const to = (path: string) => NextResponse.redirect(new URL(path, site.publicSiteUrl))

  if (url.searchParams.get("error")) return to("/login?error=oauth_denied")

  const supabase = await createSupabaseServerClient()
  if (!supabase) return to("/login?error=auth_unavailable")

  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      logEvent("warn", "auth.callback_exchange_failed")
      return to("/login?error=link_expired")
    }
    return to(next)
  }
  if (tokenHash && type && otpTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return to("/login?error=link_expired")
    return to(type === "recovery" ? "/reset-password" : next)
  }
  return to("/login?error=link_invalid")
}
