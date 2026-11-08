"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import type { OperationState } from "@/lib/forms/schemas"

export function useOperationToast(state: OperationState) {
  useEffect(() => {
    if (!state.at || !state.message) return
    if (state.status === "success") {
      toast.success(state.message)
      return
    }
    toast.error(state.message)
  }, [state.at, state.message, state.status])
}
