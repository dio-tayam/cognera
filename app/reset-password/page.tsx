import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { AuthShell } from "@/components/auth/auth-shell"
import { PasswordForm } from "@/components/dashboard/settings-forms"
import { readSupabaseConfig } from "@/lib/auth/config"
import { getSessionUser } from "@/lib/auth/session-user"

export const metadata: Metadata = { title: "Set a new password" }

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Set a new password"
      description="Choose a new password for your account. You arrive here from the reset link in your email."
      footer={
        <Link href="/dashboard" className="font-medium text-foreground underline-offset-4 hover:underline">
          Go to the dashboard
        </Link>
      }
    >
      <Suspense fallback={<p role="status">Checking your reset link.</p>}>
        <ResetPanel />
      </Suspense>
    </AuthShell>
  )
}

async function ResetPanel() {
  await connection()
  const config = readSupabaseConfig()
  if (config.state !== "ready") return <PasswordForm mode="unavailable" reason={config.reason} />
  const user = await getSessionUser()
  if (!user) {
    return (
      <PasswordForm
        mode="unavailable"
        reason="This reset link has expired or was opened in another browser. Request a new link from Forgot password."
      />
    )
  }
  return <PasswordForm mode="ready" reason={null} />
}
