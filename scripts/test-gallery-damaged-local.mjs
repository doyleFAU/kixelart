/**
 * Simulate damage from old writeLocalGallery stale-key cleanup:
 * index entry exists, payload deleted, cloud has good data.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:8765";

const browser = await chromium.launch();
const page = await browser.newPage();
const id = "art-damaged-local";
const gridSize = 16;
const goodPixels = Array.from({ length: gridSize }, (_, y) =>
  Array.from({ length: gridSize }, (_, x) => (x === 4 && y === 4 ? "#0000ff" : null))
);

await page.route("**/rest/v1/gallery_items**", async (route) => {
  const url = route.request().url();
  if (route.request().method() === "GET" && url.includes(`id=eq.${id}`)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: "11111111-1111-1111-1111-111111111111",
        id,
        name: "Recovered From Cloud",
        grid_size: gridSize,
        pixels: goodPixels,
        palette: ["#0000ff"],
        recent_colors: [],
        current_color: "#0000ff",
        secondary_color: "#000000",
        show_grid: true,
        mirror_x: false,
        brush_size: 1,
        thumbnail: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    return;
  }
  if (route.request().method() === "GET") {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return;
  }
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
  // Damaged state: index without payload (old stale-key cleanup)
  localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
    id, name: "Broken Local", updatedAt: Date.now(), gridSize: 16, thumbnail: "",
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
const px = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(4, 4, 1, 1).data[2]);
await browser.close();

console.log("Damaged local + good cloud, signed in:");
console.log("  status:", status);
console.log("  blue pixel:", px);
console.log(px === 255 && status?.includes("Loaded") ? "PASS (cloud recovery works)" : "FAIL");
