import { chromium } from "playwright";

const URL = process.argv[2] || "https://kixelart.vercel.app";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const failed = [];

page.on("pageerror", (e) => errors.push("PAGE: " + e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("CONSOLE: " + msg.text());
});
page.on("requestfailed", (req) => {
  failed.push(`${req.failure()?.errorText || "fail"} ${req.url()}`);
});

await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);

const state = await page.evaluate(() => {
  const wheel = document.getElementById("color-wheel");
  const canvas = document.getElementById("pixel-canvas");
  const auth = document.getElementById("auth-status")?.textContent;
  let wheelHasPixels = false;
  if (wheel) {
    const ctx = wheel.getContext("2d");
    const d = ctx.getImageData(60, 60, 1, 1).data;
    wheelHasPixels = d[0] + d[1] + d[2] > 0;
  }
  return {
    auth,
    wheelExists: !!wheel,
    wheelSize: wheel ? `${wheel.width}x${wheel.height}` : null,
    wheelHasPixels,
    canvasExists: !!canvas,
    mainLoaded: !!window.__kixelartInit,
  };
});

console.log("URL:", URL);
console.log("State:", JSON.stringify(state, null, 2));
if (failed.length) {
  console.log("\nFailed requests:");
  failed.forEach((f) => console.log(" ", f));
}
if (errors.length) {
  console.log("\nErrors:");
  errors.forEach((e) => console.log(" ", e));
} else {
  console.log("\nNo JS errors captured");
}

await browser.close();
