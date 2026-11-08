import { generateLocalText, LocalAiError, localAiConfigured } from "@/lib/ai/local"
import { blankToUndefined } from "@/lib/env/values"
import type { IntegrationStatus } from "@/lib/workflows/definition"
import { WorkflowStepError, type WorkflowEffects } from "@/lib/workflows/run-graph"
import { parseOutboundUrl, safeOutboundFetch, UnsafeUrlError } from "@/lib/workflows/ssrf"

export function emailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const target = blankToUndefined(env.EMAIL_WEBHOOK_URL)
  if (!target) return false
  try {
    parseOutboundUrl(target, { requireHttps: true })
    return true
  } catch {
    return false
  }
}

export function workflowIntegrations(env: NodeJS.ProcessEnv = process.env): IntegrationStatus {
  return { email: emailConfigured(env), ai: localAiConfigured(env) }
}

/**
 * External delivery is at-least-once. A crash after the provider accepts a
 * message and before the step is logged makes the retry call the provider
 * again. Each call carries an Idempotency-Key header built from the execution
 * and node, so a provider that honors it drops the duplicate; one that does
 * not can deliver twice. Follow-up tasks are local rows with a unique key, so
 * they are created exactly once.
 */
export function configuredEffects(
  handlers: Pick<WorkflowEffects, "createFollowUp">,
): WorkflowEffects {
  return {
    createFollowUp: handlers.createFollowUp,
    async sendEmail(input, context) {
      const target = blankToUndefined(process.env.EMAIL_WEBHOOK_URL)
      if (!target) throw new WorkflowStepError("Email sending is not configured.", false)
      const relaySecret = blankToUndefined(process.env.EMAIL_RELAY_SECRET)
      let response
      try {
        response = await safeOutboundFetch(target, {
          method: "POST",
          requireHttps: true,
          headers: {
            "content-type": "application/json",
            "idempotency-key": context.idempotencyKey,
            // Sent for Cognera's own /api/email-relay. A third-party provider ignores an
            // unexpected header; our relay rejects the request (401) without it.
            ...(relaySecret ? { "x-relay-secret": relaySecret } : {}),
          },
          body: JSON.stringify({ to: input.to, subject: input.subject, body: input.body }),
          signal: context.signal,
        })
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          throw new WorkflowStepError(
            `The email provider address was refused. ${error.message}`,
            false,
          )
        }
        if (context.signal.aborted) throw new WorkflowStepError("The email step timed out.", true)
        throw new WorkflowStepError("The email provider is unavailable.", true)
      }
      if (response.status === 429 || response.status >= 500) {
        throw new WorkflowStepError("The email provider is unavailable.", true)
      }
      if (response.status >= 400) {
        throw new WorkflowStepError("The email provider rejected the message.", false)
      }
      return { providerId: providerMessageId(response.text) ?? context.idempotencyKey }
    },
    async generateText(prompt, context) {
      try {
        return await generateLocalText(prompt, { signal: context.signal })
      } catch (error) {
        if (error instanceof LocalAiError)
          throw new WorkflowStepError(error.message, error.retryable)
        throw new WorkflowStepError("Local AI is unavailable.", true)
      }
    },
  }
}

function providerMessageId(text: string): string | null {
  try {
    const body = JSON.parse(text) as { id?: unknown; messageId?: unknown }
    const id = typeof body.id === "string" ? body.id : body.messageId
    return typeof id === "string" && id.length <= 200 ? id : null
  } catch {
    return null
  }
}
