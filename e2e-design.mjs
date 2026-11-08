import { chromium } from "playwright-core"
import { readFileSync } from "node:fs"

const BASE = "http://localhost:3000"
const PASSWORD = readFileSync("/tmp/cognera-design-pass.txt", "utf8").trim()
const EMAIL = "cognera.design.agent@example.com"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${BASE}/login`)
await page.locator("#email").fill(EMAIL)
await page.locator("#password").fill(PASSWORD)
await page.getByRole("button", { name: "Sign in" }).click()
await page.waitForURL(/\/dashboard/, { timeout: 8000 })

// 1. Notice should be gone (org has data)
await page.waitForTimeout(600)
const bodyText1 = await page.locator("body").innerText()
console.log("stale notice gone:", !bodyText1.includes("Tenant records are not connected"))
await page.screenshot({ path: "/tmp/cognera-overview-v2.png", fullPage: true })

// 2. Settings page
await page.goto(`${BASE}/dashboard/settings`)
await page.waitForTimeout(600)
await page.screenshot({ path: "/tmp/cognera-settings-v2.png", fullPage: true })

// 3. Team page
await page.goto(`${BASE}/dashboard/settings/team`)
await page.waitForTimeout(600)
await page.screenshot({ path: "/tmp/cognera-team-v2.png", fullPage: true })

// 4. Content hub
await page.goto(`${BASE}/dashboard/cms`)
await page.waitForTimeout(600)
await page.screenshot({ path: "/tmp/cognera-cms-v2.png", fullPage: true })

// 5. Integrations
await page.goto(`${BASE}/dashboard/integrations`)
await page.waitForTimeout(600)
await page.screenshot({ path: "/tmp/cognera-integrations-v2.png", fullPage: true })

await browser.close()
