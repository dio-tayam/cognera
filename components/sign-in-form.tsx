"use client"

import { useActionState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  initialSignInState,
  signInSchema,
  type SignInInput,
  type SignInState,
} from "@/lib/auth/sign-in"

type SignInAction = (state: SignInState, values: SignInInput) => Promise<SignInState>

export function SignInForm({
  mode,
  reason,
  action,
}: {
  mode: "ready" | "unavailable"
  reason: string | null
  action: SignInAction
}) {
  const [state, submit, pending] = useActionState(action, initialSignInState)
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })
  const unavailable = mode === "unavailable"

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
          <AlertTitle>Sign-in is unavailable</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert
          variant={
            state.status === "rejected" || state.status === "invalid" ? "destructive" : "default"
          }
        >
          <AlertTitle>
            {state.status === "blocked" ? "Sign-in is unavailable" : "Sign-in was rejected"}
          </AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="flex flex-col gap-4" disabled={unavailable || pending}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={form.formState.errors.email ? true : undefined}
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={form.formState.errors.password ? true : undefined}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <Button type="submit" size="xl" className="mt-1 w-full">{pending ? "Signing in" : "Sign in"}</Button>
      </fieldset>
    </form>
  )
}
