/**
 * Diagnose Supabase gallery_items: upsert shape, RLS, normalization.
 * Run: node scripts/diagnose-supabase.mjs
 */
import { readFileSync, existsSync } from "fs";

function loadEnv() {
  if (!existsSync(".env")) return {};
  const out = {};
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv();
const URL = env.SUPABASE_URL || "https://vazkrvcnczdyjpflpnit.supabase.co";
const KEY = env.SUPABASE_ANON_KEY || "sb_publishable_C3JudYjscrezMsBb33Bnow_IKs9bUGs";

const gridSize = 16;
const pixels = Array.from({ length: gridSize }, (_, y) =>
  Array.from({ length: gridSize }, (_, x) => (x === 0 && y === 0 ? "#ff0000" : null))
);

const testRow = {
  user_id: "00000000-0000-0000-0000-000000000001",
  id: "art-diagnose-test",
  name: "Diagnose",
  grid_size: gridSize,
  pixels,
  palette: ["#ff0000"],
  recent_colors: [],
  current_color: "#ff0000",
  secondary_color: "#000000",
  show_grid: true,
  mirror_x: false,
  brush_size: 1,
  thumbnail: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

console.log("=== Supabase gallery diagnostics ===\n");
console.log("URL:", URL);
console.log("Key prefix:", KEY.slice(0, 20) + "...");

// 1. Anonymous select (expect [] due to RLS)
const sel = await fetch(`${URL}/rest/v1/gallery_items?select=id,name,grid_size,pixels&limit=1`, {
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
  },
});
console.log("\n1. Anonymous SELECT status:", sel.status, sel.statusText);
console.log("   Body:", (await sel.text()).slice(0, 200));

// 2. Upsert without user JWT (expect RLS failure)
const upsert = await fetch(`${URL}/rest/v1/gallery_items?on_conflict=user_id,id`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(testRow),
});
console.log("\n2. Anonymous UPSERT status:", upsert.status, upsert.statusText);
console.log("   Body:", (await upsert.text()).slice(0, 400));

// 3. Test normalizeGalleryItem on mock Supabase response shapes
const { normalizeGalleryItem } = await import("../js/utils/security.js");

const shapes = [
  { label: "snake_case row", row: testRow },
  {
    label: "pixels as JSON string",
    row: { ...testRow, pixels: JSON.stringify(pixels) },
  },
  {
    label: "grid_size as string",
    row: { ...testRow, grid_size: "16" },
  },
  {
    label: "camelCase mixed",
    row: {
      id: testRow.id,
      name: testRow.name,
      gridSize: 16,
      pixels,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  },
];

console.log("\n3. normalizeGalleryItem shapes:");
for (const { label, row } of shapes) {
  const mapped = {
    id: row.id,
    name: row.name,
    gridSize: row.grid_size ?? row.gridSize,
    pixels: row.pixels,
    palette: row.palette,
    recentColors: row.recent_colors ?? row.recentColors,
    currentColor: row.current_color ?? row.currentColor,
    secondaryColor: row.secondary_color ?? row.secondaryColor,
    showGrid: row.show_grid ?? row.showGrid,
    mirrorX: row.mirror_x ?? row.mirrorX,
    brushSize: row.brush_size ?? row.brushSize,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
  const item = normalizeGalleryItem(mapped);
  const painted = item?.pixels?.flat().filter(Boolean).length ?? 0;
  console.log(`   ${label}:`, item ? `OK (${painted} pixels)` : "FAILED null");
}

// 4. Check onConflict header format
console.log("\n4. onConflict formats to test with real JWT:");
console.log("   ?on_conflict=user_id,id  (PostgREST)");
console.log("   supabase-js: { onConflict: 'user_id,id' }");
