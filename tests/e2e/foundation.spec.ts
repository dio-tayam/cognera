import { expect, test } from "@playwright/test"

test("home, status, and sign-in describe the real foundation", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: /Automate the busywork/ })).toBeVisible()
  await expect(
    page.locator("#content").getByText("Automate work. Manage content. Grow smarter."),
  ).toBeVisible()
  await expect(page.getByText(/vantyqo|orqestra|flowpilot/i)).toHaveCount(0)

  await page.getByRole("link", { name: "View system status" }).click()
  await expect(page.getByRole("heading", { name: "System status" })).toBeVisible()
  const databaseBlocked = page.getByText("DATABASE_URL is not set.", { exact: true })
  await expect(databaseBlocked).toBeVisible()
  await page.getByRole("button", { name: "Refresh status" }).click()
  await expect(databaseBlocked).toBeVisible()

  await page.goto("/sign-in")
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled()
  await expect(
    page.getByText(
      "Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in.",
    ),
  ).toBeVisible()

  await page.goto("/account")
  await expect(
    page.getByText(
      "Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable sign-in.",
    ),
  ).toBeVisible()
})
