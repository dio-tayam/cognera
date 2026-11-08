/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test } from "vitest"
import { SignInForm } from "@/components/sign-in-form"
import { initialSignInState } from "@/lib/auth/sign-in"

afterEach(() => {
  cleanup()
})

describe("SignInForm", () => {
  test("disables sign-in and explains why when auth is not configured", () => {
    render(
      <SignInForm
        mode="unavailable"
        reason="Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in."
        action={async () => initialSignInState}
      />,
    )
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled()
    expect(screen.getByText(/Supabase Auth is not configured/)).toBeInTheDocument()
  })

  test("shows validation errors and does not call the server action", async () => {
    const user = userEvent.setup()
    let called = false
    const action = async () => {
      called = true
      return { status: "rejected" as const, message: "This test action must not run." }
    }
    render(<SignInForm mode="ready" reason={null} action={action} />)
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument()
    expect(called).toBe(false)
  })
})
