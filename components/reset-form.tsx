"use client"

import { startTransition, useActionState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, describedBy } from "@/components/forms/field"
import { useOperationToast } from "@/components/forms/use-operation-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { resetPasswordAction } from "@/lib/auth/actions"
import {
  initialOperationState,
  resetSchema,
  type OperationState,
  type ResetInput,
} from "@/lib/forms/schemas"

type ResetAction = (state: OperationState, values: ResetInput) => Promise<OperationState>

export function ResetForm({
  mode,
  reason,
  action = resetPasswordAction,
}: {
  mode: "ready" | "unavailable"
  reason: string | null
  action?: ResetAction
}) {
  const [state, submit, pending] = useActionState(action, initialOperationState)
  const form = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  })
  const unavailable = mode === "unavailable"
  useOperationToast(state)

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        startTransition(() => submit(values))
      })}
    >
      {unavailable && reason ? (
        <Alert>
          <AlertTitle>Password reset is unavailable</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Reset requested" : "Reset was not sent"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="flex flex-col gap-4" disabled={unavailable || pending}>
        <Field label="Email" htmlFor="reset-email" error={form.formState.errors.email?.message}>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            aria-invalid={form.formState.errors.email ? true : undefined}
            aria-describedby={describedBy("reset-email", form.formState.errors.email?.message)}
            {...form.register("email")}
          />
        </Field>
        <Button type="submit" size="xl" className="mt-1 w-full">{pending ? "Requesting reset" : "Send reset link"}</Button>
      </fieldset>
    </form>
  )
}
