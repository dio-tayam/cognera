import { AppError } from "@/lib/errors"

export function toJsonValue(value: unknown): unknown {
  let encoded: string
  try {
    const result = JSON.stringify(value)
    if (result === undefined) {
      throw new AppError("invalid_json", "The value cannot be stored as JSON.")
    }
    encoded = result
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError("invalid_json", "The value cannot be stored as JSON.")
  }
  return JSON.parse(encoded) as unknown
}

export function jsonParam(value: unknown): string {
  const encoded = JSON.stringify(toJsonValue(value))
  if (encoded === undefined) {
    throw new AppError("invalid_json", "The value cannot be stored as JSON.")
  }
  return encoded
}
