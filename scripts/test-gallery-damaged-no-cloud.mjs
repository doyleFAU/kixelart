/**
 * Simulate damaged state + empty cloud (likely user Supabase state).
 */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:8765";

const browser = await chromium.launch();
const page = await browser.newPage();
const id = "art-damaged-no-cloud";

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

await page.addInitScript(({ id }) => {
  localStorage.clear();
  localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
    id, name: "Ghost Entry", updatedAt: Date.now(), gridSize: 16, thumbnail: "",
  }]));
  localStorage.setItem("sb-vazkrvcnczdyjpflpnit-auth-token", JSON.stringify({
    access_token: "t",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "r",
    user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
  }));
}, { id });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.locator(".gallery-item").first().click();
await page.waitForTimeout(800);
const status = await page.locator("#gallery-status").textContent();
await browser.close();

console.log("Damaged local + EMPTY cloud, signed in:");
console.log("  status:", status);
console.log(status?.includes("Could not load") ? "CONFIRMED failure mode (unfixable without re-save or cloud data)" : "unexpected:", status);
