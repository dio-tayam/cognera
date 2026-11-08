"use client"

import { useActionState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, describedBy } from "@/components/forms/field"
import { useOperationToast } from "@/components/forms/use-operation-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signUpAction } from "@/lib/auth/actions"
import {
  initialOperationState,
  signupSchema,
  type OperationState,
  type SignupInput,
} from "@/lib/forms/schemas"

type SignupAction = (state: OperationState, values: SignupInput) => Promise<OperationState>

export function SignupForm({
  mode,
  reason,
  action = signUpAction,
}: {
  mode: "ready" | "unavailable"
  reason: string | null
  action?: SignupAction
}) {
  const [state, submit, pending] = useActionState(action, initialOperationState)
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  })
  const unavailable = mode === "unavailable"
  useOperationToast(state)

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        submit(values)
      })}
    >
      {unavailable && reason ? (
        <Alert>
          <AlertTitle>Sign-up is unavailable</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert variant={state.status === "success" ? "default" : "destructive"}>
          <AlertTitle>
            {state.status === "success" ? "Sign-up result" : "Sign-up was not completed"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="flex flex-col gap-4" disabled={unavailable || pending}>
        <Field label="Email" htmlFor="signup-email" error={form.formState.errors.email?.message}>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            aria-invalid={form.formState.errors.email ? true : undefined}
            aria-describedby={describedBy("signup-email", form.formState.errors.email?.message)}
            {...form.register("email")}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="signup-password"
          error={form.formState.errors.password?.message}
        >
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={form.formState.errors.password ? true : undefined}
            aria-describedby={describedBy(
              "signup-password",
              form.formState.errors.password?.message,
            )}
            {...form.register("password")}
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="signup-confirm"
          error={form.formState.errors.confirmPassword?.message}
        >
          <Input
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            aria-describedby={describedBy(
              "signup-confirm",
              form.formState.errors.confirmPassword?.message,
            )}
            {...form.register("confirmPassword")}
          />
        </Field>
        <Button type="submit" size="xl" className="mt-1 w-full">{pending ? "Creating account" : "Create account"}</Button>
      </fieldset>
    </form>
  )
}
