import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { AuthShell, OrDivider } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"
import { SignupForm } from "@/components/signup-form"
import { signUpAction } from "@/lib/auth/actions"
import { readSupabaseConfig } from "@/lib/auth/config"
import { googleAuthStatus } from "@/lib/auth/oauth"

export const metadata: Metadata = { title: "Sign up" }

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your workspace"
      description="Sign up with Google in one click, or use your email. The first person in an organization becomes its owner."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
          . By signing up you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy
          </Link>
          .
        </>
      }
    >
      <Suspense fallback={<p role="status">Checking authentication configuration.</p>}>
        <SignupPanel />
      </Suspense>
    </AuthShell>
  )
}

async function SignupPanel() {
  await connection()
  const config = readSupabaseConfig()
  const google = await googleAuthStatus()
  return (
    <>
      <GoogleButton
        label="Sign up with Google"
        available={google.available}
        reason={google.available ? null : google.reason}
      />
      <OrDivider />
      {config.state === "ready" ? (
        <SignupForm mode="ready" reason={null} action={signUpAction} />
      ) : (
        <SignupForm mode="unavailable" reason={config.reason} action={signUpAction} />
      )}
    </>
  )
}
