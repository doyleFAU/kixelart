import { chromium } from "playwright";

const BASE = "http://localhost:8765";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  const item = {
    id: "art-signed-test",
    name: "Signed Test",
    gridSize: 16,
    pixels: Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => (x === 2 && y === 2 ? "#0000ff" : null))
    ),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    palette: ["#0000ff"],
    recentColors: [],
    currentColor: "#0000ff",
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
    thumbnail: "",
  };

  const index = [{
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    gridSize: item.gridSize,
    thumbnail: "",
  }];

  // Simulate broken post-sync state: index exists but item payload missing
  await page.evaluate(({ index, indexKey }) => {
    localStorage.setItem(indexKey, JSON.stringify(index));
  }, { index, indexKey: "kixelart-gallery-index" });

  await page.evaluate(async () => {
    const { renderGallery, initGalleryUI } = await import("./js/storage/gallery.js");
    initGalleryUI();
    renderGallery();
  });

  // Mock signed-in user + cloud fetch
  await page.evaluate(({ item }) => {
    window.__testCloudItem = {
      user_id: "00000000-0000-0000-0000-000000000001",
      id: item.id,
      name: item.name,
      grid_size: item.gridSize,
      pixels: item.pixels,
      palette: item.palette,
      recent_colors: item.recentColors,
      current_color: item.currentColor,
      secondary_color: item.secondaryColor,
      show_grid: item.showGrid,
      mirror_x: item.mirrorX,
      brush_size: item.brushSize,
      thumbnail: null,
      created_at: new Date(item.createdAt).toISOString(),
      updated_at: new Date(item.updatedAt).toISOString(),
    };
  }, { item });

  await page.addInitScript(() => {
    // no-op for reload
  });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    state.authUser = { id: "00000000-0000-0000-0000-000000000001" };

    const sync = await import("./js/supabase/gallery-sync.js");
    const client = await import("./js/supabase/client.js");
    const originalGetSupabase = client.getSupabase;
    client.getSupabase = async () => ({
      auth: {
        getSession: async () => ({
          data: { session: { user: state.authUser } },
        }),
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: window.__testCloudItem,
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    });
  });

  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(400);

  const status = await page.locator("#gallery-status").textContent();
  const pixel = await page.evaluate(() => {
    const d = document.getElementById("pixel-canvas").getContext("2d")
      .getImageData(2, 2, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  });

  await browser.close();

  if (!status?.includes("Loaded")) {
    console.error("FAIL: status =", status);
    process.exit(1);
  }
  if (pixel.b !== 255) {
    console.error("FAIL: pixel =", pixel);
    process.exit(1);
  }
  console.log("PASS: signed-in cloud fallback load works");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
