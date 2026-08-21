import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8765";

async function test(name, fn) {
  try {
    await fn();
    console.log("PASS:", name);
    return true;
  } catch (err) {
    console.error("FAIL:", name, err.message);
    return false;
  }
}

function makeItem(id, color, x = 1, y = 1) {
  const gridSize = 16;
  return {
    id,
    name: "Test " + id,
    gridSize,
    pixels: Array.from({ length: gridSize }, (_, row) =>
      Array.from({ length: gridSize }, (_, col) => (col === x && row === y ? color : null))
    ),
    createdAt: Date.now() - 5000,
    updatedAt: Date.now() - 5000,
    palette: [color],
    recentColors: [],
    currentColor: color,
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
  };
}

async function run() {
  let passed = 0;
  let failed = 0;

  const browser = await chromium.launch();

  // 1. Unsigned click load
  if (await test("unsigned local load", async () => {
    const page = await browser.newPage();
    const item = makeItem("art-unsigned", "#ff0000", 2, 2);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(({ item }) => {
      localStorage.clear();
      localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
        id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
      }]));
      localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
    }, { item });
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".gallery-item").first().click();
    await page.waitForTimeout(400);
    const px = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(2, 2, 1, 1).data[0]);
    if (px !== 255) throw new Error("pixel=" + px);
    await page.close();
  })) passed++; else failed++;

  // 2. Signed in with good local — sync returns empty cloud (full page init)
  if (await test("signed init + empty cloud sync + click", async () => {
    const page = await browser.newPage();
    const item = makeItem("art-signed-init", "#00ff00", 3, 3);
    let syncGetCount = 0;

    await page.route("**/rest/v1/gallery_items**", async (route) => {
      if (route.request().method() === "GET") {
        syncGetCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{
            user_id: "11111111-1111-1111-1111-111111111111",
            id: item.id,
            name: item.name,
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
            user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.addInitScript(({ item }) => {
      localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
        id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
      }]));
      localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
      // Fake supabase auth session in localStorage
      const key = Object.keys(localStorage).find(k => k.includes("auth-token")) || "sb-vazkrvcnczdyjpflpnit-auth-token";
      localStorage.setItem(key, JSON.stringify({
        access_token: "test-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "refresh",
        user: { id: "11111111-1111-1111-1111-111111111111", email: "t@test.com" },
      }));
    }, { item });

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const authText = await page.locator("#auth-status").textContent();
    const rowCount = await page.locator(".gallery-item").count();

    await page.locator(".gallery-item").first().click();
    await page.waitForTimeout(800);

    const status = await page.locator("#gallery-status").textContent();
    const px = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(3, 3, 1, 1).data[1]);
    const stored = await page.evaluate((id) => {
      const raw = localStorage.getItem("kixelart-gallery-" + id);
      if (!raw) return "missing";
      return JSON.parse(raw).pixels[3][3];
    }, item.id);

    await page.close();

    if (rowCount === 0) throw new Error("gallery empty after init auth=" + authText);
    if (!status?.includes("Loaded")) throw new Error("status=" + status);
    if (px !== 255) throw new Error("pixel green=" + px + " stored=" + stored);
    if (stored !== "#00ff00") throw new Error("localStorage corrupted stored=" + stored);
  })) passed++; else failed++;

  // 3. Sync throws — load should still work from local
  if (await test("signed load survives sync error", async () => {
    const page = await browser.newPage();
    const item = makeItem("art-sync-err", "#0000ff", 4, 4);

    await page.route("**/rest/v1/gallery_items**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "server error" }) });
    });

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(({ item }) => {
      localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
        id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
      }]));
      localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
    }, { item });

    await page.evaluate(async () => {
      const { state } = await import("./js/state.js");
      state.authUser = { id: "11111111-1111-1111-1111-111111111111" };
      const { syncGalleryWithCloud } = await import("./js/supabase/gallery-sync.js");
      try { await syncGalleryWithCloud(); } catch { /* expected */ }
      const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
      initGalleryUI();
      renderGallery();
    });

    await page.locator(".gallery-item").first().click();
    await page.waitForTimeout(800);
    const status = await page.locator("#gallery-status").textContent();
    const px = await page.evaluate(() => document.getElementById("pixel-canvas").getContext("2d").getImageData(4, 4, 1, 1).data[2]);
    await page.close();
    if (!status?.includes("Loaded")) throw new Error("status=" + status);
    if (px !== 255) throw new Error("pixel=" + px);
  })) passed++; else failed++;

  // 4. Hanging sync — load should not block forever when local is good
  if (await test("signed load with good local ignores hanging sync", async () => {
    const page = await browser.newPage();
    const item = makeItem("art-hang", "#ff00ff", 5, 5);

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(({ item }) => {
      localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
        id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
      }]));
      localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
    }, { item });

    await page.evaluate(async () => {
      const { state } = await import("./js/state.js");
      state.authUser = { id: "11111111-1111-1111-1111-111111111111" };
      const sync = await import("./js/supabase/gallery-sync.js");
      // Simulate in-flight sync that never completes
      sync.syncInFlight = new Promise(() => {});
    });

    await page.evaluate(async () => {
      const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
      initGalleryUI();
      renderGallery();
    });

    await page.locator(".gallery-item").first().click();
    await page.waitForTimeout(1000);
    const status = await page.locator("#gallery-status").textContent();
    await page.close();
    // Current code returns local immediately if painted > 0 — should load even if sync hangs
    if (!status?.includes("Loaded")) throw new Error("status=" + status + " (blocked on sync?)");
  })) passed++; else failed++;

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
