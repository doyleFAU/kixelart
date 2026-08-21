/**
 * Compare unsigned vs signed load when index exists but payload missing.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:8765";

const browser = await chromium.launch();

for (const signed of [false, true]) {
  const page = await browser.newPage();
  const id = "art-index-only-" + (signed ? "signed" : "unsigned");

  if (signed) {
    await page.route("**/rest/v1/gallery_items**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route("**/auth/v1/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "t",
          user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
        }),
      });
    });
  }

  await page.addInitScript(({ id, signed }) => {
    localStorage.clear();
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
      id, name: "Orphan Index", updatedAt: Date.now(), gridSize: 16, thumbnail: "",
    }]));
    if (signed) {
      localStorage.setItem("sb-vazkrvcnczdyjpflpnit-auth-token", JSON.stringify({
        access_token: "t",
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "r",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
      }));
    }
  }, { id, signed });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(signed ? 1500 : 300);
  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(600);
  const status = await page.locator("#gallery-status").textContent();
  console.log(signed ? "SIGNED" : "UNSIGNED", "orphan index click:", status);
  await page.close();
}

await browser.close();
