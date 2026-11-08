"use server"

import { redirect } from "next/navigation"
import { readSupabaseConfig } from "@/lib/auth/config"
import { mutationOriginAllowed } from "@/lib/auth/origin"
import { allowAuthAttempt } from "@/lib/auth/rate-limit"
import { signInSchema, type SignInInput, type SignInState } from "@/lib/auth/sign-in"
import { createSupabaseServerClient } from "@/lib/auth/supabase"
import { getSiteConfig } from "@/lib/site"
import {
  passwordSchema,
  resetSchema,
  signupSchema,
  type OperationState,
  type PasswordInput,
  type ResetInput,
  type SignupInput,
} from "@/lib/forms/schemas"

export type { SignInInput, SignInState }

export async function signInAction(
  _previous: SignInState,
  values: SignInInput,
): Promise<SignInState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted." }
  }

  const parsed = signInSchema.safeParse(values)
  if (!parsed.success) {
    return {
      status: "invalid",
      message: "Enter a valid email address and a password of at least 8 characters.",
    }
  }

  const config = readSupabaseConfig()
  if (config.state !== "ready") {
    return { status: "blocked", message: config.reason }
  }

  const attempt = await allowAuthAttempt("login", parsed.data.email)
  if (attempt === "limited") {
    return { status: "rejected", message: "Too many attempts. Wait and try again." }
  }
  if (attempt === "unavailable") {
    return {
      status: "blocked",
      message: "Sign-in was not attempted because rate limiting is unavailable.",
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { status: "blocked", message: "Supabase Auth is not configured." }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    const unconfirmed = error.message.toLowerCase().includes("confirm")
    return {
      status: "rejected",
      message: unconfirmed
        ? "Confirm the email before signing in."
        : "Those credentials were not accepted.",
    }
  }

  redirect("/dashboard")
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    redirect("/login")
  }
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error("Sign-out did not complete.")
  }
  redirect("/login")
}

function blocked(message: string): OperationState {
  return { status: "blocked", message, at: Date.now() }
}

function invalid(message: string): OperationState {
  return { status: "invalid", message, at: Date.now() }
}

export async function signUpAction(
  _previous: OperationState,
  values: SignupInput,
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted.", at: Date.now() }
  }

  const parsed = signupSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the email and password.")

  const config = readSupabaseConfig()
  if (config.state !== "ready") return blocked(config.reason)

  const attempt = await allowAuthAttempt("register", parsed.data.email)
  if (attempt === "limited") {
    return { status: "rejected", message: "Too many attempts. Wait and try again.", at: Date.now() }
  }
  if (attempt === "unavailable") {
    return blocked("Registration was not attempted because rate limiting is unavailable.")
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return blocked("Supabase Auth is not configured.")

  const site = getSiteConfig()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${site.publicSiteUrl}/auth/callback?next=/dashboard` },
  })
  const duplicate =
    error?.message.toLowerCase().includes("already") ||
    error?.message.toLowerCase().includes("registered")
  if (error && !duplicate) {
    return { status: "rejected", message: "Registration was not accepted.", at: Date.now() }
  }
  if (data?.session) redirect("/dashboard")
  return {
    status: "success",
    message:
      "If the address can be registered, Supabase will send a confirmation email. This page does not confirm whether the account already exists.",
    at: Date.now(),
  }
}

export async function resetPasswordAction(
  _previous: OperationState,
  values: ResetInput,
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted.", at: Date.now() }
  }

  const parsed = resetSchema.safeParse(values)
  if (!parsed.success) return invalid("Enter a valid email address.")

  const config = readSupabaseConfig()
  if (config.state !== "ready") return blocked(config.reason)

  const attempt = await allowAuthAttempt("reset", parsed.data.email)
  if (attempt === "limited") {
    return { status: "rejected", message: "Too many attempts. Wait and try again.", at: Date.now() }
  }
  if (attempt === "unavailable") {
    return blocked("Password reset was not attempted because rate limiting is unavailable.")
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return blocked("Supabase Auth is not configured.")

  const site = getSiteConfig()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site.publicSiteUrl}/auth/callback?next=/reset-password`,
  })
  if (error) {
    const limited = error.message.toLowerCase().includes("rate")
    return limited
      ? { status: "rejected", message: "Too many attempts. Wait and try again.", at: Date.now() }
      : blocked("The reset email was not requested. Nothing was sent.")
  }
  return {
    status: "success",
    message:
      "If an account exists for that email, Supabase will send a reset link. This page does not confirm whether the account exists.",
    at: Date.now(),
  }
}

export async function changePasswordAction(
  _previous: OperationState,
  values: PasswordInput,
): Promise<OperationState> {
  if (!(await mutationOriginAllowed())) {
    return { status: "rejected", message: "The request origin was not accepted.", at: Date.now() }
  }

  const parsed = passwordSchema.safeParse(values)
  if (!parsed.success) return invalid("Check the new password.")

  const config = readSupabaseConfig()
  if (config.state !== "ready") return blocked(config.reason)

  const supabase = await createSupabaseServerClient()
  if (!supabase) return blocked("Supabase Auth is not configured.")

  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return blocked("Sign in before changing a password. Nothing was changed.")
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { status: "rejected", message: "The password was not changed.", at: Date.now() }
  }
  return { status: "success", message: "Password updated.", at: Date.now() }
}
