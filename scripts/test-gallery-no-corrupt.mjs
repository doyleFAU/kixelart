import { chromium } from "playwright";

const BASE = "http://localhost:8765";

async function run() {
  const item = {
    id: "art-no-corrupt",
    name: "Keep Local",
    gridSize: 16,
    pixels: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => (x === 2 && y === 2 ? "#00ff00" : null))
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    palette: ["#00ff00"],
    recentColors: [],
    currentColor: "#00ff00",
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
  };

  const emptyCloudRow = {
    user_id: "00000000-0000-0000-0000-000000000001",
    id: item.id,
    name: item.name,
    grid_size: item.gridSize,
    pixels: Array.from({ length: 16 }, () => Array(16).fill(null)),
    palette: [],
    recent_colors: [],
    current_color: "#00ff00",
    secondary_color: "#000000",
    show_grid: true,
    mirror_x: false,
    brush_size: 1,
    thumbnail: null,
    created_at: new Date().toISOString(),
    updated_at: new Date(Date.now() + 999999).toISOString(),
  };

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.route("**/rest/v1/gallery_items**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyCloudRow),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(({ item }) => {
    localStorage.clear();
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
      id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
    }]));
    localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
  }, { item });

  await page.reload({ waitUntil: "networkidle" });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    state.authUser = { id: "00000000-0000-0000-0000-000000000001" };
    const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
    initGalleryUI();
    renderGallery();
  });

  // Two clicks — second click failed before fix because cloud overwrote localStorage
  for (let i = 0; i < 2; i++) {
    await page.locator(".gallery-item").first().click();
    await page.waitForTimeout(400);
  }

  const status = await page.locator("#gallery-status").textContent();
  const pixel = await page.evaluate(() => {
    const d = document.getElementById("pixel-canvas").getContext("2d")
      .getImageData(2, 2, 1, 1).data;
    return { g: d[1] };
  });

  const stored = await page.evaluate((id) => {
    const raw = localStorage.getItem("kixelart-gallery-" + id);
    const pixels = raw ? JSON.parse(raw).pixels : null;
    let painted = 0;
    for (const row of pixels || []) for (const c of row || []) if (c) painted++;
    return painted;
  }, item.id);

  await browser.close();

  if (!status?.includes("Loaded") || pixel.g !== 255) {
    console.error("FAIL", { status, pixel, stored });
    process.exit(1);
  }
  if (stored === 0) {
    console.error("FAIL: localStorage was corrupted by empty cloud data");
    process.exit(1);
  }
  console.log("PASS: repeated signed-in loads keep good local art");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
