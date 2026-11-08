import { createHash, randomBytes } from "node:crypto"

export function newInvitationToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function rateLimitBucket(action: string, subject: string): string {
  return createHash("sha256").update(`${action}:${subject}`).digest("hex")
}
