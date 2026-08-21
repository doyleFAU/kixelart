import {
  GALLERY_INDEX_KEY,
  GALLERY_ITEM_PREFIX,
  MAX_GALLERY_ITEMS,
} from "../config.js";
import { state } from "../state.js";
import { el } from "../elements.js";
import { clonePixels } from "../utils/pixels.js";
import {
  createGalleryId,
  sanitizeGalleryId,
  sanitizeGalleryName,
  sanitizeThumbnailUrl,
  validateGalleryIndex,
  validateGalleryItem,
  parseJsonSafe,
} from "../utils/security.js";
import { render, fitZoom } from "../renderer.js";
import { applyProjectData, scheduleSave } from "./project.js";
import {
  pushGalleryItemToCloud,
  deleteGalleryItemFromCloud,
  fetchGalleryItemFromCloud,
} from "../supabase/gallery-sync.js";

function getGalleryIndex() {
  return validateGalleryIndex(localStorage.getItem(GALLERY_INDEX_KEY));
}

function setGalleryIndex(index) {
  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(index));
}

export function getGalleryItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return null;
  try {
    const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + safeId);
    if (!raw) return null;
    return validateGalleryItem(parseJsonSafe(raw));
  } catch {
    return null;
  }
}

function setGalleryItem(id, item) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId || !item) return;
  localStorage.setItem(GALLERY_ITEM_PREFIX + safeId, JSON.stringify(item));
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

export function saveToGallery() {
  const name = sanitizeGalleryName(el.saveName.value.trim() || `Art ${Date.now()}`);
  const now = Date.now();
  const id = state.activeGalleryId && sanitizeGalleryId(state.activeGalleryId)
    ? state.activeGalleryId
    : createGalleryId();
  const isUpdate = !!state.activeGalleryId && !!getGalleryItem(state.activeGalleryId);

  const item = {
    id,
    name,
    createdAt: isUpdate ? (getGalleryItem(id)?.createdAt || now) : now,
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
  };

  try {
    let index = getGalleryIndex();

    if (isUpdate) {
      const idx = index.findIndex((e) => e.id === id);
      const entry = {
        id,
        name,
        updatedAt: now,
        gridSize: state.gridSize,
        thumbnail: sanitizeThumbnailUrl(item.thumbnail),
      };
      if (idx >= 0) index[idx] = entry;
      else index.unshift(entry);
    } else {
      if (index.length >= MAX_GALLERY_ITEMS) {
        const removed = index.pop();
        if (removed) removeGalleryItem(removed.id);
      }
      index.unshift({
        id,
        name,
        updatedAt: now,
        gridSize: state.gridSize,
        thumbnail: sanitizeThumbnailUrl(item.thumbnail),
      });
      state.activeGalleryId = id;
    }

    setGalleryItem(id, item);
    setGalleryIndex(index);
    el.saveName.value = name;
    renderGallery();
    scheduleSave();
    el.saveStatus.textContent = isUpdate ? "Art updated" : "Art saved";
    el.saveStatus.className = "save-status saved";
    pushGalleryItemToCloud(item).catch(() => {
      el.saveStatus.textContent = "Saved locally (cloud sync failed)";
      el.saveStatus.className = "save-status unsaved";
    });
  } catch {
    alert("Could not save — browser storage may be full. Try deleting old saves.");
  }
}

function loadGalleryItem(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return null;

  let item = getGalleryItem(safeId);
  if (item) return item;

  const raw = localStorage.getItem(GALLERY_ITEM_PREFIX + safeId);
  if (raw) {
    item = validateGalleryItem(parseJsonSafe(raw));
    if (item) {
      setGalleryItem(safeId, item);
      return item;
    }
  }

  return null;
}

async function loadFromGallery(id) {
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return;

  let item = loadGalleryItem(safeId);

  if (!item && state.authUser) {
    el.saveStatus.textContent = "Loading…";
    el.saveStatus.className = "save-status unsaved";
    try {
      item = await fetchGalleryItemFromCloud(safeId);
    } catch {
      item = null;
    }
  }

  if (!item) {
    el.saveStatus.textContent = "Could not load art";
    el.saveStatus.className = "save-status unsaved";
    renderGallery();
    return;
  }

  state.activeGalleryId = safeId;
  applyProjectData(item);
  el.saveName.value = item.name;
  renderGallery();
  scheduleSave();
  fitZoom();
  el.saveStatus.textContent = "Loaded";
  el.saveStatus.className = "save-status saved";
}

function deleteFromGallery(id, e) {
  e.stopPropagation();
  const safeId = sanitizeGalleryId(id);
  if (!safeId) return;

  const item = getGalleryItem(safeId);
  if (!confirm(`Delete "${item?.name || "this art"}"?`)) return;

  removeGalleryItem(safeId);
  setGalleryIndex(getGalleryIndex().filter((entry) => entry.id !== safeId));

  if (state.activeGalleryId === safeId) {
    state.activeGalleryId = null;
    el.saveName.value = "";
  }

  renderGallery();
  scheduleSave();
  deleteGalleryItemFromCloud(safeId).catch(() => {
    el.saveStatus.textContent = "Deleted locally (cloud sync failed)";
    el.saveStatus.className = "save-status unsaved";
  });
}

export function renderGallery() {
  const index = getGalleryIndex();
  el.galleryList.replaceChildren();

  index.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "gallery-item";
    if (entry.id === state.activeGalleryId) row.classList.add("active");

    const thumb = document.createElement("img");
    thumb.className = "gallery-thumb";
    thumb.src = entry.thumbnail || "";
    thumb.alt = entry.name;
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";

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
    delBtn.addEventListener("click", (ev) => deleteFromGallery(entry.id, ev));

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(delBtn);
    row.addEventListener("click", () => {
      loadFromGallery(entry.id);
    });
    el.galleryList.appendChild(row);
  });
}

export function startNewGallerySave() {
  state.activeGalleryId = null;
  el.saveName.value = "";
  el.saveName.focus();
  renderGallery();
}
