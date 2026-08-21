/**
 * Test: local item exists, sign-in sync must NOT overwrite good local with empty cloud.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8765";

function makeItem(id, color, x, y) {
  const gridSize = 16;
  return {
    id,
    name: "Local Good",
    gridSize,
    pixels: Array.from({ length: gridSize }, (_, row) =>
      Array.from({ length: gridSize }, (_, col) => (col === x && row === y ? color : null))
    ),
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 10000,
    palette: [color],
    recentColors: [],
    currentColor: color,
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
  };
}

const browser = await chromium.launch();
const page = await browser.newPage();
const item = makeItem("art-local-good", "#ff0000", 6, 6);
const userId = "11111111-1111-1111-1111-111111111111";

await page.route("**/rest/v1/gallery_items**", async (route) => {
  if (route.request().method() === "GET") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        user_id: userId,
        id: item.id,
        name: "Cloud Empty Wins",
        grid_size: item.gridSize,
        pixels: Array.from({ length: 16 }, () => Array(16).fill(null)),
        palette: [],
        recent_colors: [],
        current_color: "#000000",
        secondary_color: "#000000",
        show_grid: true,
        mirror_x: false,
        brush_size: 1,
        thumbnail: null,
        created_at: new Date().toISOString(),
        updated_at: new Date(Date.now() + 999999999).toISOString(),
      }]),
    });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
});

await page.route("**/auth/v1/**", async (route) => {
  if (route.request().url().includes("token")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        user: { id: userId, email: "t@test.com" },
      }),
    });
    return;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

await page.addInitScript(({ item }) => {
  localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
    id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
  }]));
  localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
  localStorage.setItem("sb-vazkrvcnczdyjpflpnit-auth-token", JSON.stringify({
    access_token: "test-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh",
    user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
  }));
}, { item });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const afterSync = await page.evaluate((id) => {
  const raw = localStorage.getItem("kixelart-gallery-" + id);
  if (!raw) return { missing: true };
  const p = JSON.parse(raw).pixels[6][6];
  return { pixel: p };
}, item.id);

await page.locator(".gallery-item").first().click();
await page.waitForTimeout(800);

const status = await page.locator("#gallery-status").textContent();
const canvasR = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(6, 6, 1, 1).data[0]);

await browser.close();

console.log("After sync local pixel:", afterSync);
console.log("Click status:", status);
console.log("Canvas R:", canvasR);

if (afterSync.pixel !== "#ff0000") {
  console.error("FAIL: sync overwrote local storage");
  process.exit(1);
}
if (!status?.includes("Loaded") || canvasR !== 255) {
  console.error("FAIL: click did not load red pixel");
  process.exit(1);
}
console.log("PASS: local preserved through signed sync + click");
