"use client"

import { ErrorState } from "@/components/layout/error-state"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="Something went wrong"
      message={error.message}
      digest={error.digest}
      onRetry={() => reset()}
    />
  )
}
