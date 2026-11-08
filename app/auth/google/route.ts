import { NextResponse } from "next/server"
import { googleAuthStatus, safeNextPath } from "@/lib/auth/oauth"
import { createSupabaseServerClient } from "@/lib/auth/supabase"
import { logEvent } from "@/lib/log/logger"
import { getSiteConfig } from "@/lib/site"

/** Starts Google sign-in (and sign-up: a first Google login creates the account). */
export async function GET(request: Request) {
  const site = getSiteConfig()
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get("next"))
  const back = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, site.publicSiteUrl))

  const status = await googleAuthStatus()
  if (!status.available) return back("google_unavailable")

  const supabase = await createSupabaseServerClient()
  if (!supabase) return back("google_unavailable")

  const callback = new URL("/auth/callback", site.publicSiteUrl)
  callback.searchParams.set("next", next)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  })
  if (error || !data.url) {
    logEvent("warn", "auth.google_start_failed")
    return back("google_failed")
  }
  return NextResponse.redirect(data.url)
}
