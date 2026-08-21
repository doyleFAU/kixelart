import { chromium } from "playwright";

const BASE = "http://localhost:8765";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());

  await page.reload({ waitUntil: "networkidle" });

  // Draw on canvas via state (simulates user art)
  await page.evaluate(() => {
    import("./js/state.js").then(({ state }) => {
      state.pixels[0][0] = "#00ff00";
      import("./js/renderer.js").then(({ render }) => render());
    });
  });
  await page.waitForTimeout(200);

  await page.fill("#save-name", "My Green Dot");
  await page.click("#btn-save-art");
  await page.waitForTimeout(300);

  const savedStatus = await page.locator("#gallery-status").textContent();
  if (!savedStatus?.includes("saved")) {
    throw new Error(`Save failed: ${savedStatus}`);
  }

  // Clear canvas
  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    const { createGrid } = await import("./js/drawing/canvas.js");
    createGrid(32);
    state.activeGalleryId = null;
  });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    const ctx = document.getElementById("pixel-canvas").getContext("2d");
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  });

  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const ctx = document.getElementById("pixel-canvas").getContext("2d");
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  });

  const loadStatus = await page.locator("#gallery-status").textContent();
  const name = await page.inputValue("#save-name");

  await browser.close();

  if (errors.length) {
    console.error("Page errors:", errors);
    process.exit(1);
  }

  if (!loadStatus?.includes("Loaded")) {
    console.error("Load status:", loadStatus);
    process.exit(1);
  }

  if (name !== "My Green Dot") {
    console.error("Name not restored:", name);
    process.exit(1);
  }

  if (after.g !== 255 || before.g === 255) {
    console.error("Pixel not restored. before:", before, "after:", after);
    process.exit(1);
  }

  console.log("PASS: Full save → clear → click-to-load works");
  console.log("  Status:", loadStatus);
  console.log("  Pixel after load:", after);
}

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
