import { loadEnvFiles } from "../lib/env/files"
import { hostedAuthCoverage } from "../lib/auth/coverage"

async function main(): Promise<void> {
  loadEnvFiles()
  const coverage = hostedAuthCoverage()
  console.log(`email verification: blocked. ${coverage.reason}`)
  console.log(`password reset delivery: blocked. ${coverage.reason}`)

  const url = process.env.SUPABASE_URL?.trim()
  const anon = process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) {
    console.log("provider sign-in: blocked. Supabase Auth is not configured in this process.")
    process.exitCode = 2
    return
  }

  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: anon },
  })
  if (!health.ok) {
    console.log(`provider health: failed. HTTP ${health.status}.`)
    process.exitCode = 1
    return
  }
  console.log("provider health: pass. The auth service responded.")

  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({
      email: "cognera-auth-check@example.com",
      password: "incorrect-password",
    }),
  })
  if (login.ok) {
    console.log("provider sign-in: failed. An unknown account was accepted.")
    process.exitCode = 1
    return
  }
  console.log(
    `provider sign-in: pass. Unknown credentials were rejected with HTTP ${login.status}. Email delivery was not tested.`,
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error"
  console.error(
    `failed: ${message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")}`,
  )
  process.exitCode = 1
})
