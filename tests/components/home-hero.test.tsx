/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import { HomeHero } from "@/components/home-hero"

afterEach(() => {
  cleanup()
})

describe("HomeHero", () => {
  test("shows the headline and real destinations", () => {
    render(<HomeHero />)
    expect(screen.getByRole("heading", { level: 1, name: /Automate the busywork/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Get started free/ })).toHaveAttribute("href", "/signup")
    expect(screen.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute(
      "href",
      "/auth/google?next=/dashboard",
    )
    expect(screen.getByRole("link", { name: /See how it works/ })).toHaveAttribute("href", "#how")
    expect(screen.getByRole("link", { name: "View system status" })).toHaveAttribute("href", "/status")
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login")
    expect(screen.getByRole("link", { name: "Open the application" })).toHaveAttribute("href", "/dashboard")
  })
})
