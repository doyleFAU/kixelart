/**
 * Test production site JS behavior with injected localStorage.
 * Run: node scripts/test-production-gallery.mjs
 */
import { chromium } from "playwright";

const PROD = "https://kixelart.vercel.app";

const browser = await chromium.launch();
const page = await browser.newPage();

const item = {
  id: "art-prod-test",
  name: "Prod Test",
  gridSize: 16,
  pixels: Array.from({ length: 16 }, (_, row) =>
    Array.from({ length: 16 }, (_, col) => (col === 7 && row === 7 ? "#00ff00" : null))
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

await page.addInitScript(({ item }) => {
  localStorage.setItem("kixelart-gallery-index", JSON.stringify([{
    id: item.id, name: item.name, updatedAt: item.updatedAt, gridSize: item.gridSize, thumbnail: "",
  }]));
  localStorage.setItem("kixelart-gallery-" + item.id, JSON.stringify(item));
}, { item });

await page.goto(PROD, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Check which loadGalleryItem logic is live
const loadFnSource = await page.evaluate(async () => {
  const res = await fetch("/js/storage/gallery.js");
  const text = await res.text();
  const m = text.match(/async function loadGalleryItem[\s\S]{0,400}/);
  return m ? m[0] : "not found";
});

console.log("Production loadGalleryItem snippet:");
console.log(loadFnSource.slice(0, 300));
console.log("...");

const hasOldGate = loadFnSource.includes("countPaintedPixels");
console.log("\nHas countPaintedPixels gate (OLD BUG):", hasOldGate);

await page.locator(".gallery-item").first().click();
await page.waitForTimeout(800);

const status = await page.locator("#gallery-status").textContent();
const px = await page.evaluate(() => {
  const c = document.getElementById("pixel-canvas");
  return c.getContext("2d").getImageData(7, 7, 1, 1).data[1];
});

console.log("\nUnsigned click on production:");
console.log("  status:", status);
console.log("  green pixel:", px);

await browser.close();
process.exit(hasOldGate || !status?.includes("Loaded") || px !== 255 ? 1 : 0);
