/**
 * Engine limits. The SQL functions in 0008_workflow_reliability.sql hold the
 * matching database limits: five job attempts, a fifteen-minute execution
 * deadline, three manual retries, and the per-organization quota defaults.
 */
export const workflowLimits = {
  maxNodes: 40,
  maxEdges: 80,
  /** Nodes visited in one attempt. The graph is acyclic, so this is a backstop. */
  maxSteps: 40,
  /** Wall time for one attempt. A worker gives up and schedules a retry after this. */
  attemptDurationMs: 30_000,
  /** Wall time for one node, including outbound HTTP. */
  stepTimeoutMs: 10_000,
  /** A running job whose lease is older than this is treated as abandoned. */
  leaseStaleSeconds: 120,
  maxAttempts: 5,
  backoffBaseSeconds: 2,
  backoffMaxSeconds: 300,
  executionDeadlineMinutes: 15,
  manualRetries: 3,
  defaultExecutionsPerHour: 100,
  defaultMaxRunning: 5,
  webhookBodyBytes: 32_000,
  outboundResponseBytes: 64_000,
} as const

/** Bounded exponential backoff with jitter, in seconds. */
export function backoffSeconds(attempt: number, random: () => number = Math.random): number {
  const exponent = Math.min(Math.max(attempt, 1), 16)
  const base = Math.min(
    workflowLimits.backoffMaxSeconds,
    workflowLimits.backoffBaseSeconds * 2 ** (exponent - 1),
  )
  const jitter = Math.floor(base * 0.2 * random())
  return Math.min(workflowLimits.backoffMaxSeconds, base + jitter)
}
