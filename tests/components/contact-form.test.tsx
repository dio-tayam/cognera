/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test } from "vitest"
import { ContactForm } from "@/components/contact-form"
import { initialOperationState } from "@/lib/forms/schemas"

afterEach(() => {
  cleanup()
})

describe("ContactForm", () => {
  test("shows validation errors and does not call the action", async () => {
    const user = userEvent.setup()
    let called = false
    render(
      <ContactForm
        action={async () => {
          called = true
          return { ...initialOperationState, status: "blocked", message: "must not run" }
        }}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument()
    expect(called).toBe(false)
  })
})
