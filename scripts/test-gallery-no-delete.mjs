import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8765";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const item = {
    id: "art-no-delete",
    name: "Keep Both",
    gridSize: 16,
    pixels: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => (x === 1 && y === 1 ? "#ff0000" : null))
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    palette: ["#ff0000"],
    recentColors: [],
    currentColor: "#ff0000",
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
  };
  const item2 = {
    ...item,
    id: "art-no-delete-2",
    name: "Second",
    pixels: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => (x === 2 && y === 2 ? "#00ff00" : null))
    ),
  };

  await page.route("**/rest/v1/gallery_items**", async (route) => {
    if (route.request().method() === "GET") {
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

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(({ item, item2 }) => {
    localStorage.clear();
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([
      { id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "" },
      { id: item2.id, name: item2.name, updatedAt: item2.updatedAt, gridSize: item2.gridSize, thumbnail: "" },
    ]));
    localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
    localStorage.setItem("kixelart-gallery-" + item2.id, JSON.stringify(item2));
  }, { item, item2 });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    state.authUser = { id: "11111111-1111-1111-1111-111111111111" };
    const { syncGalleryWithCloud } = await import("./js/supabase/gallery-sync.js");
    await syncGalleryWithCloud();
    const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
    initGalleryUI();
    renderGallery();
  });

  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("kixelart-gallery-art-"))
  );

  await page.locator(`.gallery-item[data-id="${item.id}"]`).click();
  await page.waitForTimeout(500);
  const status = await page.locator("#gallery-status").textContent();
  const px = await page.evaluate(() =>
    document.getElementById("pixel-canvas").getContext("2d").getImageData(1, 1, 1, 1).data[0]
  );

  await browser.close();

  if (keys.length < 2) {
    console.error("FAIL: sync deleted local keys", keys);
    process.exit(1);
  }
  if (!status?.includes("Loaded") || px !== 255) {
    console.error("FAIL:", { status, px, keys });
    process.exit(1);
  }
  console.log("PASS: sync keeps all local keys and loads art");
}

run();
