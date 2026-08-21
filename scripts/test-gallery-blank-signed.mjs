import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8765";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const item = {
    id: "art-blank-signed",
    name: "Blank Canvas",
    gridSize: 16,
    pixels: Array.from({ length: 16 }, () => Array(16).fill(null)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    palette: ["#4a8f65"],
    recentColors: [],
    currentColor: "#4a8f65",
    secondaryColor: "#000000",
    showGrid: true,
    mirrorX: false,
    brushSize: 1,
  };

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(({ item }) => {
    localStorage.clear();
    localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
      id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
    }]));
    localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
  }, { item });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js");
    state.authUser = { id: "11111111-1111-1111-1111-111111111111" };
    const { initGalleryUI, renderGallery } = await import("./js/storage/gallery.js");
    initGalleryUI();
    renderGallery();
  });

  await page.locator(".gallery-item").first().click();
  await page.waitForTimeout(500);

  const status = await page.locator("#gallery-status").textContent();
  const gridSize = await page.inputValue("#canvas-size");

  await browser.close();

  if (!status?.includes("Loaded")) {
    console.error("FAIL blank signed load:", status);
    process.exit(1);
  }
  if (gridSize !== "16") {
    console.error("FAIL grid size:", gridSize);
    process.exit(1);
  }
  console.log("PASS: blank canvas loads when signed in");
}

run();
