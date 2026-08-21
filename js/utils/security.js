import { DEFAULT_PALETTE, MAX_GALLERY_ITEMS } from "../config.js";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export const ALLOWED_GRID_SIZES = new Set([16, 32, 64, 128]);
export const ALLOWED_TOOLS = new Set([
  "brush", "eraser", "line", "rect", "circle",
  "replace", "fill", "picker", "hand",
]);
export const MAX_GALLERY_NAME_LENGTH = 40;
export const MAX_PALETTE_SIZE = 64;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const GALLERY_ID_RE = /^art-[0-9A-Za-z_-]{1,64}$/;
const DATA_URL_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function normalizeGridSize(value) {
  const size = Number(value);
  return ALLOWED_GRID_SIZES.has(size) ? size : null;
}

function normalizePixels(pixels, gridSize) {
  if (typeof pixels === "string") {
    try {
      pixels = JSON.parse(pixels);
    } catch {
      return null;
    }
    if (typeof pixels === "string") {
      try {
        pixels = JSON.parse(pixels);
      } catch {
        return null;
      }
    }
  }
  if (Array.isArray(pixels) && pixels.length > 0 && !Array.isArray(pixels[0])) {
    const flat = pixels;
    const size = gridSize || Math.round(Math.sqrt(flat.length));
    if (size > 0) {
      const grid = [];
      for (let y = 0; y < size; y++) {
        grid.push(flat.slice(y * size, (y + 1) * size));
      }
      pixels = grid;
    }
  }
  if (Array.isArray(pixels)) return pixels;
  if (pixels && typeof pixels === "object") {
    const keys = Object.keys(pixels).filter((k) => /^\d+$/.test(k));
    if (keys.length) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => pixels[k]);
    }
  }
  return null;
}

export function sanitizeHexColor(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    value = `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, "0")}`;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (HEX_COLOR_RE.test(normalized)) return normalized.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return `#${normalized.toLowerCase()}`;
  return null;
}

export function safeCssColor(value, fallback) {
  return sanitizeHexColor(value) || fallback;
}

export function sanitizeColorList(colors, fallback = []) {
  if (!Array.isArray(colors)) return [...fallback];
  const out = [];
  for (const color of colors) {
    const safe = sanitizeHexColor(color);
    if (safe && !out.includes(safe)) out.push(safe);
    if (out.length >= MAX_PALETTE_SIZE) break;
  }
  return out.length ? out : [...fallback];
}

export function sanitizeGalleryName(name) {
  if (typeof name !== "string") return "Untitled";
  return name
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_GALLERY_NAME_LENGTH) || "Untitled";
}

export function sanitizeGalleryId(id) {
  if (id == null) return null;
  const trimmed = String(id).trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function createGalleryId() {
  return `art-${Date.now()}`;
}

export function sanitizeThumbnailUrl(url) {
  if (typeof url !== "string" || !url) return "";
  return DATA_URL_IMAGE_RE.test(url) ? url : "";
}

export function parseJsonSafe(raw, fallback = null) {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (
        Object.hasOwn(data, "__proto__") ||
        Object.hasOwn(data, "constructor") ||
        Object.hasOwn(data, "prototype")
      ) {
        return fallback;
      }
    }
    return data;
  } catch {
    return fallback;
  }
}

export function validatePixelGrid(pixels, gridSize) {
  if (!Number.isInteger(gridSize) || !ALLOWED_GRID_SIZES.has(gridSize)) return null;
  if (!Array.isArray(pixels) || pixels.length !== gridSize) return null;

  const grid = [];
  for (let y = 0; y < gridSize; y++) {
    const row = pixels[y];
    if (!Array.isArray(row) || row.length !== gridSize) return null;
    const safeRow = [];
    for (let x = 0; x < gridSize; x++) {
      const cell = row[x];
      safeRow.push(cell == null || cell === "" ? null : sanitizeHexColor(String(cell)));
    }
    grid.push(safeRow);
  }
  return grid;
}

/** Lenient gallery item parser — used when loading saved art (local or cloud). */
export function normalizeGalleryItem(data) {
  if (!data || typeof data !== "object") return null;

  const id = sanitizeGalleryId(String(data.id ?? ""));
  const gridSize = normalizeGridSize(data.gridSize ?? data.grid_size);
  if (!id || !gridSize) return null;

  let pixels = normalizePixels(data.pixels, gridSize);
  if (!Array.isArray(pixels)) return null;

  const grid = [];
  for (let y = 0; y < gridSize; y++) {
    const row = Array.isArray(pixels[y]) ? pixels[y] : [];
    const safeRow = [];
    for (let x = 0; x < gridSize; x++) {
      const cell = row[x];
      safeRow.push(cell == null || cell === "" ? null : sanitizeHexColor(String(cell)));
    }
    grid.push(safeRow);
  }

  const now = Date.now();
  const createdRaw = data.createdAt ?? data.created_at;
  const updatedRaw = data.updatedAt ?? data.updated_at;

  return {
    id,
    name: sanitizeGalleryName(data.name),
    createdAt: createdRaw ? new Date(createdRaw).getTime() || now : now,
    updatedAt: updatedRaw ? new Date(updatedRaw).getTime() || now : now,
    gridSize,
    pixels: grid,
    palette: sanitizeColorList(data.palette, DEFAULT_PALETTE),
    recentColors: sanitizeColorList(data.recentColors ?? data.recent_colors, []),
    currentColor: sanitizeHexColor(data.currentColor ?? data.current_color) || "#4a8f65",
    secondaryColor: sanitizeHexColor(data.secondaryColor ?? data.secondary_color) || "#8b6914",
    showGrid: (data.showGrid ?? data.show_grid) !== false,
    mirrorX: !!(data.mirrorX ?? data.mirror_x),
    brushSize: [1, 2, 3].includes(Number(data.brushSize ?? data.brush_size))
      ? Number(data.brushSize ?? data.brush_size)
      : 1,
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : "",
  };
}

export function validateProjectData(data) {
  if (!data || typeof data !== "object") return null;
  const gridSize = normalizeGridSize(data.gridSize);
  if (!gridSize) return null;

  const pixels = validatePixelGrid(normalizePixels(data.pixels, gridSize), gridSize);
  if (!pixels) return null;

  return {
    gridSize,
    pixels,
    palette: sanitizeColorList(data.palette, DEFAULT_PALETTE),
    recentColors: sanitizeColorList(data.recentColors, []),
    currentColor: sanitizeHexColor(data.currentColor) || "#4a8f65",
    secondaryColor: sanitizeHexColor(data.secondaryColor) || "#8b6914",
    showGrid: data.showGrid !== false,
    mirrorX: !!data.mirrorX,
    mirrorY: !!data.mirrorY,
    exportTransparent: data.exportTransparent !== false,
    brushSize: [1, 2, 3].includes(data.brushSize) ? data.brushSize : 1,
    activeGalleryId: data.activeGalleryId ? sanitizeGalleryId(data.activeGalleryId) : null,
  };
}

export function validateGalleryIndexEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = sanitizeGalleryId(entry.id);
  if (!id) return null;
  const gridSize = normalizeGridSize(entry.gridSize) || 32;

  return {
    id,
    name: sanitizeGalleryName(entry.name),
    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
    gridSize,
    thumbnail: sanitizeThumbnailUrl(entry.thumbnail),
  };
}

export function validateGalleryIndex(raw) {
  const parsed = parseJsonSafe(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(validateGalleryIndexEntry)
    .filter(Boolean)
    .slice(0, MAX_GALLERY_ITEMS);
}

export function validateGalleryItem(data) {
  if (!data || typeof data !== "object") return null;
  const id = sanitizeGalleryId(data.id);
  const gridSize = normalizeGridSize(data.gridSize);
  if (!id || !gridSize) return null;

  const pixels = validatePixelGrid(normalizePixels(data.pixels, gridSize), gridSize);
  if (!pixels) return null;

  const now = Date.now();
  return {
    id,
    name: sanitizeGalleryName(data.name),
    createdAt: Number.isFinite(data.createdAt) ? data.createdAt : now,
    updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : now,
    gridSize,
    pixels,
    palette: sanitizeColorList(data.palette, DEFAULT_PALETTE),
    recentColors: sanitizeColorList(data.recentColors, []),
    currentColor: sanitizeHexColor(data.currentColor) || "#4a8f65",
    secondaryColor: sanitizeHexColor(data.secondaryColor) || "#8b6914",
    showGrid: data.showGrid !== false,
    mirrorX: !!data.mirrorX,
    brushSize: [1, 2, 3].includes(Number(data.brushSize)) ? Number(data.brushSize) : 1,
    thumbnail: sanitizeThumbnailUrl(data.thumbnail),
  };
}

export function isAllowedImageFile(file) {
  if (!file || typeof file !== "object") return false;
  if (!Number.isFinite(file.size) || file.size <= 0) return false;
  if (file.size > MAX_IMPORT_BYTES) return false;
  return ALLOWED_IMAGE_TYPES.has(file.type);
}

export function sanitizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

export function sanitizeToolName(name) {
  return ALLOWED_TOOLS.has(name) ? name : "brush";
}

export function sanitizeExportScale(value) {
  const scale = parseInt(value, 10);
  return [1, 2, 4, 8, 16].includes(scale) ? scale : 4;
}
