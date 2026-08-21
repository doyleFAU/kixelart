/**
 * Fresh save while signed in should always load.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:8765";

const browser = await chromium.launch();
const page = await browser.newPage();

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

await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("sb-vazkrvcnczdyjpflpnit-auth-token", JSON.stringify({
    access_token: "t",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "r",
    user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
  }));
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Draw a pixel via app API
await page.evaluate(async () => {
  const { state } = await import("./js/state.js");
  const { setPixel } = await import("./js/drawing/canvas.js");
  setPixel(8, 8, "#ff0000");
});

await page.fill("#save-name", "Fresh Signed Save");
await page.click("#btn-save-art");
await page.waitForTimeout(500);

// Clear canvas
await page.evaluate(async () => {
  const { createGrid } = await import("./js/drawing/canvas.js");
  createGrid(32);
});

await page.locator(".gallery-item").first().click();
await page.waitForTimeout(800);

const status = await page.locator("#gallery-status").textContent();
const px = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(8, 8, 1, 1).data[0]);
await browser.close();

console.log("Fresh save while signed in:");
console.log("  status:", status);
console.log("  red pixel:", px);
if (status?.includes("Loaded") && px === 255) {
  console.log("PASS");
} else {
  console.log("FAIL");
  process.exit(1);
}
