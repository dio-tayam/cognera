export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status = status
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return "Unknown error"
}

/** Removes connection strings, emails, and token-like values before logging. */
export function publicErrorDetail(error: unknown): string {
  return errorText(error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
}

const databaseMessages: Array<[string, string]> = [
  ["you cannot change your own role", "You cannot change your own role."],
  ["only an owner can grant the owner role", "Only an owner can grant the owner role."],
  ["membership change is not permitted", "You cannot change that membership."],
  ["invitation change is not permitted", "You cannot create that invitation."],
  ["invitation was not found", "That invitation could not be accepted."],
  ["invitation has expired", "That invitation has expired."],
  ["invitation email does not match", "That invitation could not be accepted."],
  ["transfer ownership before deleting", "Transfer ownership before deleting this account."],
  ["organization slug is invalid", "Use a lowercase slug with hyphens."],
  ["user is not a member of this tenant", "You do not belong to this organization."],
]

/** Maps database errors to short messages that omit SQL, emails, and secrets. */
export function safeDatabaseMessage(error: unknown): string {
  const detail = publicErrorDetail(error).toLowerCase()
  for (const [needle, message] of databaseMessages) {
    if (detail.includes(needle)) return message
  }
  return "The database rejected the request."
}
