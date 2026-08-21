import {
  GALLERY_INDEX_KEY,
  GALLERY_ITEM_PREFIX,
  MAX_GALLERY_ITEMS,
} from "../config.js";
import { state } from "../state.js";
import { el } from "../elements.js";
import { clonePixels, countPaintedPixels } from "../utils/pixels.js";
import {
  createGalleryId,
  sanitizeGalleryId,
  sanitizeGalleryName,
  sanitizeThumbnailUrl,
  validateGalleryIndex,
  normalizeGalleryItem,
  parseJsonSafe,
} from "../utils/security.js";
import { render, fitZoom } from "../renderer.js";
import { applyProjectData, scheduleSave } from "./project.js";
import {
  pushGalleryItemToCloud,
  deleteGalleryItemFromCloud,
  waitForGallerySync,
  queryCloudGalleryItem,
} from "../supabase/gallery-sync.js";

let galleryUiBound = false;

function setGalleryStatus(message, type = "") {
  if (el.galleryStatus) {
    el.galleryStatus.textContent = message;
    el.galleryStatus.className = type ? `gallery-status ${type}` : "gallery-status";
  }
  if (el.saveStatus && message) {
    el.saveStatus.textContent = message;
    el.saveStatus.className = type === "error"
      ? "save-status unsaved"
      : type === "success"
        ? "save-status saved"
        : "save-status unsaved";
  }
}

function getGalleryIndex() {
  return validateGalleryIndex(localStorage.getItem(GALLERY_INDEX_KEY));
}

function setGalleryIndex(index) {
  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(index));
}

function readRawGalleryItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return null;
  const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + safeId);
  if (!raw) return null;
  return normalizeGalleryItem(parseJsonSafe(raw));
}

export function getGalleryItem(id) {
  return readRawGalleryItem(id);
}

function storagePayload(item) {
  if (!item) return item;
  return {
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    gridSize: item.gridSize,
    pixels: item.pixels,
    palette: item.palette,
    recentColors: item.recentColors,
    currentColor: item.currentColor,
    secondaryColor: item.secondaryColor,
    showGrid: item.showGrid,
    mirrorX: item.mirrorX,
    brushSize: item.brushSize,
  };
}

function setGalleryItem(id, item) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId || !item) return;
  localStorage.setItem(GALLERY_ITEM_PREFIX + safeId, JSON.stringify(storagePayload(item)));
}

async function loadGalleryItem(safeId) {
  let item = readRawGalleryItem(safeId);
  if (item && countPaintedPixels(item.pixels) > 0) {
    return item;
  }

  if (!state.authUser) {
    return item;
  }

  await waitForGallerySync();

  item = readRawGalleryItem(safeId);
  if (item && countPaintedPixels(item.pixels) > 0) {
    return item;
  }

  const cloud = await queryCloudGalleryItem(safeId);
  if (!cloud) {
    return item;
  }

  if (countPaintedPixels(cloud.pixels) > countPaintedPixels(item?.pixels ?? [])) {
    setGalleryItem(safeId, cloud);
    return cloud;
  }

  return item ?? cloud;
}

function removeGalleryItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return;
  localStorage.removeItem(GALLERY_ITEM_PREFIX + safeId);
}

function makeThumbnailDataUrl() {
  const size = 48;
  const thumb = document.createElement("canvas");
  thumb.width = size;
  thumb.height = size;
  const tctx = thumb.getContext("2d");
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(el.canvas, 0, 0, size, size);
  return thumb.toDataURL("image/png");
}

function formatGalleryDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildIndexEntry(item) {
  return {
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
    gridSize: item.gridSize,
    thumbnail: sanitizeThumbnailUrl(item.thumbnail),
  };
}

export function initGalleryUI() {
  if (galleryUiBound || !el.galleryList) return;
  galleryUiBound = true;

  el.galleryList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".gallery-delete");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const row = deleteBtn.closest(".gallery-item");
      if (row?.dataset.id) deleteFromGallery(row.dataset.id, e);
      return;
    }

    const row = e.target.closest(".gallery-item");
    if (row?.dataset.id) loadFromGallery(row.dataset.id);
  });
}

export function saveToGallery() {
  const name = sanitizeGalleryName(el.saveName.value.trim() || `Art ${Date.now()}`);
  const now = Date.now();
  const id = state.activeGalleryId && sanitizeGalleryId(state.activeGalleryId)
    ? state.activeGalleryId
    : createGalleryId();
  const existing = readRawGalleryItem(id);
  const isUpdate = !!existing;

  const item = normalizeGalleryItem({
    id,
    name,
    createdAt: isUpdate ? (existing.createdAt || now) : now,
    updatedAt: now,
    gridSize: state.gridSize,
    pixels: clonePixels(state.pixels),
    palette: [...state.palette],
    recentColors: [...state.recentColors],
    currentColor: state.currentColor,
    secondaryColor: state.secondaryColor,
    showGrid: state.showGrid,
    mirrorX: state.mirrorX,
    brushSize: state.brushSize,
    thumbnail: makeThumbnailDataUrl(),
  });

  if (!item) {
    setGalleryStatus("Could not save this piece.", "error");
    return;
  }

  try {
    let index = getGalleryIndex();
    const entry = buildIndexEntry(item);

    if (isUpdate) {
      const idx = index.findIndex((e) => e.id === id);
      if (idx >= 0) index[idx] = entry;
      else index.unshift(entry);
    } else {
      if (index.length >= MAX_GALLERY_ITEMS) {
        const removed = index.pop();
        if (removed) removeGalleryItem(removed.id);
      }
      index.unshift(entry);
      state.activeGalleryId = id;
    }

    setGalleryItem(id, item);
    setGalleryIndex(index);
    el.saveName.value = name;
    renderGallery();
    scheduleSave();
    setGalleryStatus(isUpdate ? "Art updated" : "Art saved", "success");
    pushGalleryItemToCloud(item).catch(() => {
      setGalleryStatus("Saved locally (cloud sync failed)", "error");
    });
  } catch {
    setGalleryStatus("Storage full — delete old saves.", "error");
  }
}

async function loadFromGallery(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) {
    setGalleryStatus("Could not load — invalid id.", "error");
    return;
  }

  setGalleryStatus("Loading art…");

  document.querySelectorAll(".gallery-item.loading").forEach((node) => {
    node.classList.remove("loading");
  });
  const row = el.galleryList?.querySelector(`.gallery-item[data-id="${CSS.escape(safeId)}"]`);
  row?.classList.add("loading");

  try {
    const item = await loadGalleryItem(safeId);

    if (!item) {
      setGalleryStatus("Could not load this piece.", "error");
      return;
    }

    state.activeGalleryId = safeId;
    applyProjectData(item);
    el.saveName.value = item.name;
    renderGallery();
    scheduleSave();
    fitZoom();
    setGalleryStatus(`Loaded "${item.name}"`, "success");
  } catch (err) {
    console.error("Gallery load failed:", err);
    setGalleryStatus("Could not load this piece.", "error");
  } finally {
    row?.classList.remove("loading");
  }
}

function deleteFromGallery(id, e) {
  e.stopPropagation();
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return;

  const item = readRawGalleryItem(safeId);
  if (!confirm(`Delete "${item?.name || "this art"}"?`)) return;

  removeGalleryItem(safeId);
  setGalleryIndex(getGalleryIndex().filter((entry) => entry.id !== safeId));

  if (state.activeGalleryId === safeId) {
    state.activeGalleryId = null;
    el.saveName.value = "";
  }

  renderGallery();
  scheduleSave();
  setGalleryStatus("Art deleted", "success");
  deleteGalleryItemFromCloud(safeId).catch(() => {
    setGalleryStatus("Deleted locally (cloud sync failed)", "error");
  });
}

export function renderGallery() {
  const index = getGalleryIndex();
  if (!el.galleryList) return;
  el.galleryList.replaceChildren();

  index.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "gallery-item";
    row.dataset.id = entry.id;
    if (entry.id === state.activeGalleryId) row.classList.add("active");

    const thumb = document.createElement("img");
    thumb.className = "gallery-thumb";
    thumb.src = entry.thumbnail || "";
    thumb.alt = entry.name;
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    thumb.draggable = false;

    const info = document.createElement("div");
    info.className = "gallery-info";

    const nameEl = document.createElement("div");
    nameEl.className = "gallery-name";
    nameEl.textContent = entry.name;

    const metaEl = document.createElement("div");
    metaEl.className = "gallery-meta";
    metaEl.textContent = `${entry.gridSize}×${entry.gridSize} · ${formatGalleryDate(entry.updatedAt)}`;

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const delBtn = document.createElement("button");
    delBtn.className = "gallery-delete";
    delBtn.type = "button";
    delBtn.title = "Delete";
    delBtn.textContent = "×";

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(delBtn);
    el.galleryList.appendChild(row);
  });
}

export function startNewGallerySave() {
  state.activeGalleryId = null;
  el.saveName.value = "";
  el.saveName.focus();
  renderGallery();
  setGalleryStatus("");
}
