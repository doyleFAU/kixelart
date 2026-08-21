import { chromium } from "playwright";

const BASE = "http://localhost:8765";

function makeItem(id, color) {
  const gridSize = 16;
  return {
    id,
    name: "Test Art",
    gridSize,
    pixels: Array.from({ length: gridSize }, (_, y) =>
      Array.from({ length: gridSize }, (_, x) => (x === 1 && y === 1 ? color : null))
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
    thumbnail: "",
  };
}

function makeCloudRow(item, { empty = false, newer = true } = {}) {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    id: item.id,
    name: item.name,
    grid_size: item.gridSize,
    pixels: empty
      ? Array.from({ length: item.gridSize }, () => Array(item.gridSize).fill(null))
      : item.pixels,
    palette: item.palette,
    recent_colors: item.recentColors,
    current_color: item.currentColor,
    secondary_color: item.secondaryColor,
    show_grid: item.showGrid,
    mirror_x: item.mirrorX,
    brush_size: item.brushSize,
    thumbnail: null,
    created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date(newer ? Date.now() + 60000 : item.updatedAt).toISOString(),
  };
}

async function run() {
  const item = makeItem("art-signed-local", "#0000ff");
  const cloudRow = makeCloudRow(item, { empty: true, newer: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (msg) => logs.push(msg.text()));

  await page.route("**/rest/v1/gallery_items**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([cloudRow]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.evaluate(({ item, indexKey, prefix }) => {
    localStorage.clear();
    const entry = {
      id: item.id,
      name: item.name,
      updatedAt: item.updatedAt,
      gridSize: item.gridSize,
      thumbnail: "",
    };
    localStorage.setItem(indexKey, JSON.stringify([entry]));
    localStorage.setItem(prefix + item.id, JSON.stringify(item));
  }, {
    item,
    indexKey: "kixelart-gallery-index",
    prefix: "kixelart-gallery-",
  });

  await page.reload({ waitUntil: "networkidle" });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    state.authUser = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@example.com",
    };
    const { syncGalleryWithCloud } = await import("./js/supabase/gallery-sync.js");
    await syncGalleryWithCloud();
    const { renderGallery } = await import("./js/storage/gallery.js");
    renderGallery();
  });

  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(600);

  const status = await page.locator("#gallery-status").textContent();
  const pixel = await page.evaluate(() => {
    const d = document.getElementById("pixel-canvas").getContext("2d")
      .getImageData(1, 1, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  });

  await browser.close();

  if (!status?.includes("Loaded")) {
    console.error("FAIL status:", status);
    console.error("logs:", logs.join("\n"));
    process.exit(1);
  }
  if (pixel.b !== 255) {
    console.error("FAIL pixel:", pixel);
    process.exit(1);
  }
  console.log("PASS: signed-in sync kept/loadable art despite empty newer cloud copy");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
