import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { AuthShell, OrDivider, authErrorMessage } from "@/components/auth/auth-shell"
import { GoogleButton } from "@/components/auth/google-button"
import { SignInForm } from "@/components/sign-in-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signInAction } from "@/lib/auth/actions"
import { readSupabaseConfig } from "@/lib/auth/config"
import { googleAuthStatus } from "@/lib/auth/oauth"

export const metadata: Metadata = { title: "Log in" }

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in"
      description="Sign in with Google or your email to open your workspace."
      footer={
        <>
          New to Cognera?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<p role="status">Checking authentication configuration.</p>}>
        <LoginPanel searchParams={searchParams} />
      </Suspense>
      <p className="text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          Forgot password
        </Link>
      </p>
    </AuthShell>
  )
}

async function LoginPanel({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection()
  const params = await searchParams
  const error = authErrorMessage(params.error)
  const config = readSupabaseConfig()
  const google = await googleAuthStatus()
  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <GoogleButton available={google.available} reason={google.available ? null : google.reason} />
      <OrDivider />
      {config.state === "ready" ? (
        <SignInForm mode="ready" reason={null} action={signInAction} />
      ) : (
        <SignInForm mode="unavailable" reason={config.reason} action={signInAction} />
      )}
    </>
  )
}
