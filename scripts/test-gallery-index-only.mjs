/**
 * Test: gallery index visible but item payload missing (cloud-only path).
 * Run: BASE=http://localhost:8765 node scripts/test-gallery-index-only.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8765";

async function runScenario(name, { cloudRow, expectLoaded, expectPixel }) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const id = cloudRow?.id || "art-cloud-only";

  await page.route("**/rest/v1/gallery_items**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === "GET" && url.includes(`id=eq.${id}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cloudRow),
      });
      return;
    }
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([cloudRow].filter(Boolean)) });
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
          user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const gridSize = 16;
  const pixels = Array.from({ length: gridSize }, (_, y) =>
    Array.from({ length: gridSize }, (_, x) => (x === 2 && y === 2 ? "#00ff00" : null))
  );

  await page.addInitScript(({ id, gridSize }) => {
    localStorage.clear();
    // Index entry ONLY — no kixelart-gallery-{id} payload (simulates broken/partial state)
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
      id,
      name: "Cloud Only",
      updatedAt: Date.now(),
      gridSize,
      thumbnail: "",
    }]));
    localStorage.setItem("sb-vazkrvcnczdyjpflpnit-auth-token", JSON.stringify({
      access_token: "test-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "refresh",
      user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
    }));
  }, { id, gridSize });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const signedIn = await page.locator("#auth-status").textContent();
  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(1000);

  const status = await page.locator("#gallery-status").textContent();
  const px = await page.evaluate(() => {
    const ctx = document.getElementById("pixel-canvas").getContext("2d");
    return ctx.getImageData(2, 2, 1, 1).data[1];
  });
  const localKey = await page.evaluate((id) => localStorage.getItem("kixelart-gallery-" + id), id);

  await browser.close();

  const loaded = status?.includes("Loaded");
  const ok = loaded === expectLoaded && (expectPixel == null || px === expectPixel);
  console.log(ok ? "PASS" : "FAIL", name);
  console.log("  signedIn:", signedIn?.slice(0, 40));
  console.log("  status:", status);
  console.log("  pixel G:", px, "expected", expectPixel);
  console.log("  localKey after click:", localKey ? "written" : "missing");
  return ok;
}

const gridSize = 16;
const goodPixels = Array.from({ length: gridSize }, (_, y) =>
  Array.from({ length: gridSize }, (_, x) => (x === 2 && y === 2 ? "#00ff00" : null))
);
const emptyPixels = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));

const userId = "11111111-1111-1111-1111-111111111111";

let passed = 0;
let failed = 0;

const cases = [
  {
    name: "signed: index only + cloud has good pixels",
    cloudRow: {
      user_id: userId,
      id: "art-good-cloud",
      name: "Good Cloud",
      grid_size: gridSize,
      pixels: goodPixels,
      palette: ["#00ff00"],
      recent_colors: [],
      current_color: "#00ff00",
      secondary_color: "#000000",
      show_grid: true,
      mirror_x: false,
      brush_size: 1,
      thumbnail: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    expectLoaded: true,
    expectPixel: 255,
  },
  {
    name: "signed: index only + cloud has EMPTY pixels",
    cloudRow: {
      user_id: userId,
      id: "art-empty-cloud",
      name: "Empty Cloud",
      grid_size: gridSize,
      pixels: emptyPixels,
      palette: [],
      recent_colors: [],
      current_color: "#000000",
      secondary_color: "#000000",
      show_grid: true,
      mirror_x: false,
      brush_size: 1,
      thumbnail: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    expectLoaded: true, // normalize succeeds, blank canvas loads
    expectPixel: 0,
  },
  {
    name: "signed: index only + cloud 404 (RLS/no row)",
    cloudRow: null,
    expectLoaded: false,
    expectPixel: null,
  },
];

for (const c of cases) {
  if (await runScenario(c.name, c)) passed++;
  else failed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
