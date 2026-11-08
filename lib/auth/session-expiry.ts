/** True when a session expiry timestamp is missing or already in the past. */
export function sessionExpired(
  expiresAtSeconds: number | null | undefined,
  nowMs: number,
): boolean {
  if (expiresAtSeconds == null || !Number.isFinite(expiresAtSeconds)) return true
  return nowMs >= expiresAtSeconds * 1000
}
