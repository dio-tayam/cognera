import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { MarketingPage } from "@/components/marketing/marketing-page"
import { Button } from "@/components/ui/button"
import { signOutAction } from "@/lib/auth/actions"
import { readSupabaseConfig } from "@/lib/auth/config"
import { createSupabaseServerClient } from "@/lib/auth/supabase"

export const metadata: Metadata = { title: "Account" }

export default function AccountPage() {
  return (
    <MarketingPage narrow eyebrow="Account" title="Account" description="The signed-in email comes from Supabase when auth is configured.">
      <Suspense fallback={<p role="status">Checking the session.</p>}>
        <AccountPanel />
      </Suspense>
    </MarketingPage>
  )
}

async function AccountPanel() {
  await connection()
  const config = readSupabaseConfig()
  if (config.state !== "ready") {
    return (
      <div className="flex flex-col gap-3">
        <p>{config.reason}</p>
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return <p>Supabase Auth is not configured.</p>
  }

  const { data, error } = await supabase.auth.getUser()
  if (!data.user) {
    const missingSession =
      !error ||
      error.name === "AuthSessionMissingError" ||
      error.message.toLowerCase().includes("session")
    if (!missingSession) {
      return <p role="alert">Could not read the session: {error.message}</p>
    }
    return (
      <p>
        You are not signed in.{" "}
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    )
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p>Signed in as {data.user.email ?? data.user.id}.</p>
      <Link href="/dashboard" className="text-primary underline-offset-4 hover:underline">
        Open the application
      </Link>
      <form action={signOutAction}>
        <Button type="submit">Sign out</Button>
      </form>
    </div>
  )
}
