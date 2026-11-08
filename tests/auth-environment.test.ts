import { describe, expect, test } from "vitest"
import { hostedAuthCoverage } from "@/lib/auth/coverage"

describe("hosted authentication coverage", () => {
  test("keeps email delivery blocked when no mailbox is available", () => {
    const coverage = hostedAuthCoverage()
    expect(coverage.provider).toBe("not-configured")
    expect(coverage.emailVerification).toBe("blocked")
    expect(coverage.passwordResetDelivery).toBe("blocked")
  })
})
