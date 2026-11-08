import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { AuthShell } from "@/components/auth/auth-shell"
import { ResetForm } from "@/components/reset-form"
import { resetPasswordAction } from "@/lib/auth/actions"
import { readSupabaseConfig } from "@/lib/auth/config"

export const metadata: Metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot password"
      description="We'll email a reset link. This page never reveals whether an account exists. Signed up with Google? Just use Continue with Google."
      footer={
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      <Suspense fallback={<p role="status">Checking authentication configuration.</p>}>
        <ResetPanel />
      </Suspense>
    </AuthShell>
  )
}

async function ResetPanel() {
  await connection()
  const config = readSupabaseConfig()
  if (config.state === "ready") {
    return <ResetForm mode="ready" reason={null} action={resetPasswordAction} />
  }
  return <ResetForm mode="unavailable" reason={config.reason} action={resetPasswordAction} />
}
