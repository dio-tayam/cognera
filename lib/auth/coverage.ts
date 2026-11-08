export type HostedAuthCoverage = {
  provider: "configured" | "not-configured"
  emailVerification: "blocked"
  passwordResetDelivery: "blocked"
  reason: string
}

/** Email delivery cannot be marked passed unless a mailbox was actually read. */
export function hostedAuthCoverage(env: NodeJS.ProcessEnv = process.env): HostedAuthCoverage {
  const configured = Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_ANON_KEY?.trim())
  return {
    provider: configured ? "configured" : "not-configured",
    emailVerification: "blocked",
    passwordResetDelivery: "blocked",
    reason: configured
      ? "Supabase Auth is configured, but this process has no mailbox, so message delivery stays blocked."
      : "Supabase Auth is not configured in this process, and there is no mailbox to verify delivery.",
  }
}
