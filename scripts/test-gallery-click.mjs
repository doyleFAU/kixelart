import { chromium } from "playwright";

const BASE = "http://localhost:8765";

function makeGalleryItem(id, name) {
  const gridSize = 16;
  const pixels = Array.from({ length: gridSize }, (_, y) =>
    Array.from({ length: gridSize }, (_, x) =>
      x === 0 && y === 0 ? "#ff0000" : null
    )
  );
  return {
    id,
    name,
    gridSize,
    pixels,
    savedAt: Date.now(),
    primaryColor: "#ff0000",
    secondaryColor: "#000000",
  };
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleLogs = [];
  const pageErrors = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(BASE, { waitUntil: "networkidle" });

  const initErrors = pageErrors.slice();
  if (initErrors.length) {
    console.error("Page errors on load:", initErrors);
  }

  const item = makeGalleryItem("art-test123", "Test Piece");
  const index = [{ id: item.id, name: item.name, savedAt: item.savedAt, gridSize: item.gridSize }];

  await page.evaluate(
    ({ index, item, prefix, indexKey }) => {
      localStorage.setItem(indexKey, JSON.stringify(index));
      localStorage.setItem(prefix + item.id, JSON.stringify(item));
    },
    {
      index,
      item,
      prefix: "kixelart-gallery-",
      indexKey: "kixelart-gallery-index",
    }
  );

  await page.evaluate(async () => {
    const mod = await import("./js/storage/gallery.js");
    mod.renderGallery();
  });

  const rowCount = await page.locator(".gallery-item").count();
  console.log("Gallery rows rendered:", rowCount);

  const statusBefore = await page.locator("#gallery-status").textContent();
  console.log("Status before click:", JSON.stringify(statusBefore));

  await page.locator(".gallery-item").first().click();

  await page.waitForTimeout(500);

  const statusAfter = await page.locator("#gallery-status").textContent();
  console.log("Status after click:", JSON.stringify(statusAfter));

  const saveStatus = await page.locator("#save-status").textContent();
  console.log("Save status:", JSON.stringify(saveStatus));

  const loaded = await page.evaluate(() => {
    const canvas = document.getElementById("pixel-canvas");
    const ctx = canvas.getContext("2d");
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  });
  console.log("Top-left pixel RGBA:", loaded);

  const gridSize = await page.evaluate(() => {
    return document.getElementById("grid-size")?.value;
  });
  console.log("Grid size select:", gridSize);

  const clickWorked =
    statusAfter?.includes("Loaded") ||
    saveStatus?.includes("Loaded") ||
    (loaded.r === 255 && loaded.g === 0 && loaded.b === 0);

  console.log("\n--- Console logs ---");
  consoleLogs.forEach((l) => console.log(l));

  if (pageErrors.length) {
    console.log("\n--- Page errors ---");
    pageErrors.forEach((e) => console.log(e));
  }

  await browser.close();

  if (!clickWorked) {
    console.error("\nFAIL: Gallery click did not load art");
    process.exit(1);
  }
  console.log("\nPASS: Gallery click loaded art");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
