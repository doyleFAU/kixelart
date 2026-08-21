import { chromium } from "playwright";

const BASE = "http://localhost:8765";

async function run() {
  const item = {
    id: "art-cloud-only",
    name: "Cloud Only",
    gridSize: 16,
    pixels: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => (x === 3 && y === 3 ? "#ff00ff" : null))
    ),
    palette: ["#ff00ff"],
    recent_colors: [],
    current_color: "#ff00ff",
    secondary_color: "#000000",
    show_grid: true,
    mirror_x: false,
    brush_size: 1,
    thumbnail: null,
    created_at: new Date(Date.now() - 5000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.route("**/rest/v1/gallery_items**", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "GET" && url.includes("id=eq.art-cloud-only")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(item),
      });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(({ item }) => {
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
      id: item.id,
      name: item.name,
      updatedAt: Date.now(),
      gridSize: item.grid_size,
      thumbnail: "",
    }]));
  }, { item });

  await page.evaluate(async () => {
    const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
    const { state } = await import("./js/state.js");
    state.authUser = { id: "00000000-0000-0000-0000-000000000001" };
    initGalleryUI();
    renderGallery();
  });

  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(600);

  const status = await page.locator("#gallery-status").textContent();
  const pixel = await page.evaluate(() => {
    const d = document.getElementById("pixel-canvas").getContext("2d")
      .getImageData(3, 3, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  });

  await browser.close();

  if (!status?.includes("Loaded") || pixel.r !== 255 || pixel.b !== 255) {
    console.error("FAIL", { status, pixel });
    process.exit(1);
  }
  console.log("PASS: signed-in click fetches missing item from cloud");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
