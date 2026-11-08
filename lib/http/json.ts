import { AppError, safeDatabaseMessage } from "@/lib/errors"

export type ApiErrorBody = {
  ok: false
  error: { code: string; message: string }
}

export type ApiSuccess<T> = { ok: true; data: T }

const noStore = { "cache-control": "no-store" }

export function jsonOk<T>(data: T, status = 200): Response {
  const body: ApiSuccess<T> = { ok: true, data }
  return Response.json(body, { status, headers: noStore })
}

export function jsonError(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { ok: false, error: { code, message } }
  return Response.json(body, { status, headers: noStore })
}

export function jsonFromError(error: unknown): Response {
  if (error instanceof AppError) return jsonError(error.status, error.code, error.message)
  return jsonError(500, "internal_error", safeDatabaseMessage(error))
}
