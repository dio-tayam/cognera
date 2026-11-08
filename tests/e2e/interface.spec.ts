import { expect, test, type Page } from "@playwright/test"

const routes = [
  "/",
  "/features",
  "/pricing",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/forgot-password",
  "/status",
  "/account",
  "/dashboard",
  "/dashboard/leads",
  "/dashboard/automations",
  "/dashboard/automations/new",
  "/dashboard/automations/sample-intake",
  "/dashboard/runs",
  "/dashboard/cms",
  "/dashboard/cms/pages",
  "/dashboard/cms/posts",
  "/dashboard/cms/media",
  "/dashboard/analytics",
  "/dashboard/integrations",
  "/dashboard/settings",
  "/dashboard/settings/team",
  "/dashboard/settings/security",
]

async function sameOriginLinks(page: Page): Promise<string[]> {
  return page
    .locator("a[href^='/']")
    .evaluateAll((anchors) =>
      anchors
        .map((anchor) => anchor.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/") && !href.startsWith("//")),
    )
}

test("public and application routes render", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route)
    expect(response?.status(), route).toBeLessThan(400)
    await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible()
  }

  await page.goto("/sign-in")
  await expect(page).toHaveURL(/\/login$/)
  await page.goto("/dashboard/automations/missing-automation")
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
})

test("internal links from the home and application shells resolve", async ({ page }) => {
  const hrefs = new Set<string>()
  for (const route of ["/", "/features", "/dashboard", "/dashboard/cms", "/dashboard/settings"]) {
    await page.goto(route)
    for (const href of await sameOriginLinks(page)) hrefs.add(href.split("#")[0] ?? href)
  }

  expect(hrefs.size).toBeGreaterThan(10)
  for (const href of hrefs) {
    const response = await page.goto(href)
    expect(response?.status(), href).toBeLessThan(400)
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible()
    await expect(page.getByRole("heading", { name: "Page not found" }), href).toHaveCount(0)
  }
})

test("navigation, forms, tables, dialogs, and theme respond", async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden()
  await page.getByRole("button", { name: "Open menu" }).click()
  const menu = page.getByRole("dialog", { name: "Menu" })
  await expect(menu).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  await page.getByRole("button", { name: "Open menu" }).click()
  await menu.getByRole("link", { name: "Features" }).click()
  await expect(page).toHaveURL(/\/features$/)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/features")
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused()

  await page.getByRole("button", { name: "Choose theme" }).click()
  await page.getByRole("menuitemradio", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Choose theme" }).click()
  await page.getByRole("menuitemradio", { name: "Light" }).press("Enter")
  await expect(page.locator("html")).not.toHaveClass(/dark/)

  await page.goto("/pricing")
  await expect(page.getByRole("button", { name: "Choose Foundation" })).toBeDisabled()
  await expect(page.getByRole("status")).toHaveText(
    "Billing is not connected. This plan cannot be purchased.",
  )

  await page.goto("/contact")
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.getByText("Enter your name.")).toBeVisible()
  await page.getByLabel("Name").fill("Ada Cole")
  await page.getByLabel("Email").fill("ada@example.com")
  await page.getByLabel("Message").fill("This message should not be delivered.")
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.locator("#content").getByText("No message was sent.")).toBeVisible()

  await page.goto("/signup")
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled()
  await page.goto("/forgot-password")
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeDisabled()

  await page.goto("/dashboard/leads")
  await expect(page.getByText(/Preview mode/)).toBeVisible()
  await expect(page.getByRole("cell", { name: "Amina Cole", exact: true })).toBeVisible()
  await page.getByLabel("Search leads").fill("Northwind")
  await expect(page.getByRole("cell", { name: "Northwind Clinic", exact: true })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Amina Cole", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Clear search" }).click()
  await page.getByRole("button", { name: "Next page" }).click()
  await expect(page.getByText("Page 2 of 3")).toBeVisible()
  await expect(page.getByRole("cell", { name: "Farah Singh", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Previous page" }).click()
  await page.getByRole("button", { name: "View Amina Cole" }).click()
  const leadDialog = page.getByRole("dialog", { name: "Amina Cole" })
  await expect(leadDialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(leadDialog).toBeHidden()
  await page.getByLabel("Search leads").fill("Northwind")
  await page.getByRole("button", { name: "Remove Northwind Clinic" }).click()
  await expect(page.getByRole("heading", { name: "Remove this preview lead?" })).toBeVisible()
  await page.getByRole("button", { name: "Remove from preview" }).click()
  await expect(page.getByRole("region", { name: "Notifications alt+T" })).toContainText(
    "Nothing was deleted on the server.",
  )

  await page.goto("/dashboard/automations/sample-intake")
  await page.getByRole("tab", { name: "Steps" }).click()
  await expect(page.getByText("Receive sample event")).toBeVisible()
  await expect(page.getByRole("button", { name: "Run automation" })).toBeDisabled()

  await page.goto("/dashboard/analytics")
  await page.getByRole("tab", { name: "Content" }).click()
  await expect(
    page.getByRole("heading", { name: "Content analytics are not connected" }),
  ).toBeVisible()

  await page.goto("/dashboard/automations/new")
  await page.getByLabel("Name").fill("Unsaved draft")
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("unsaved")
    void dialog.dismiss()
  })
  await page
    .getByRole("navigation", { name: "Application" })
    .getByRole("link", { name: "Overview" })
    .click()
  await expect(page).toHaveURL(/\/dashboard\/automations\/new$/)

  await page.goto("/dashboard/settings/team")
  await page.getByRole("button", { name: "Send invitation" }).click()
  await expect(page.getByText("Enter a valid email address.")).toBeVisible()
})
