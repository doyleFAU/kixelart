import {
  GALLERY_INDEX_KEY,
  GALLERY_ITEM_PREFIX,
  MAX_GALLERY_ITEMS,
} from "../config.js";
import { state } from "../state.js";
import { el } from "../elements.js";
import { clonePixels, escapeHtml } from "../utils/pixels.js";
import { render, fitZoom } from "../renderer.js";
import { applyProjectData, scheduleSave } from "./project.js";

function getGalleryIndex() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_INDEX_KEY) || "[]");
  } catch {
    return [];
  }
}

function setGalleryIndex(index) {
  localStorage.setItem(GALLERY_INDEX_KEY, JSON.stringify(index));
}

export function getGalleryItem(id) {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_ITEM_PREFIX + id));
  } catch {
    return null;
  }
}

function setGalleryItem(id, item) {
  localStorage.setItem(GALLERY_ITEM_PREFIX + id, JSON.stringify(item));
}

function removeGalleryItem(id) {
  localStorage.removeItem(GALLERY_ITEM_PREFIX + id);
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
  const name = el.saveName.value.trim() || `Art ${Date.now()}`;
  const now = Date.now();
  const id = state.activeGalleryId || `art-${now}`;
  const isUpdate = !!state.activeGalleryId && getGalleryItem(state.activeGalleryId);

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
      const entry = { id, name, updatedAt: now, gridSize: state.gridSize, thumbnail: item.thumbnail };
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
        thumbnail: item.thumbnail,
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
  } catch {
    alert("Could not save — browser storage may be full. Try deleting old saves.");
  }
}

function loadFromGallery(id) {
  const item = getGalleryItem(id);
  if (!item) {
    renderGallery();
    return;
  }
  state.activeGalleryId = id;
  applyProjectData(item);
  el.saveName.value = item.name;
  renderGallery();
  scheduleSave();
  fitZoom();
}

function deleteFromGallery(id, e) {
  e.stopPropagation();
  const item = getGalleryItem(id);
  if (!confirm(`Delete "${item?.name || "this art"}"?`)) return;

  removeGalleryItem(id);
  setGalleryIndex(getGalleryIndex().filter((entry) => entry.id !== id));

  if (state.activeGalleryId === id) {
    state.activeGalleryId = null;
    el.saveName.value = "";
  }

  renderGallery();
  scheduleSave();
}

export function renderGallery() {
  const index = getGalleryIndex();
  el.galleryList.innerHTML = "";

  index.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "gallery-item";
    if (entry.id === state.activeGalleryId) row.classList.add("active");

    const thumb = document.createElement("img");
    thumb.className = "gallery-thumb";
    thumb.src = entry.thumbnail || "";
    thumb.alt = "";

    const info = document.createElement("div");
    info.className = "gallery-info";
    info.innerHTML =
      `<div class="gallery-name">${escapeHtml(entry.name)}</div>` +
      `<div class="gallery-meta">${entry.gridSize}×${entry.gridSize} · ${formatGalleryDate(entry.updatedAt)}</div>`;

    const delBtn = document.createElement("button");
    delBtn.className = "gallery-delete";
    delBtn.title = "Delete";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", (ev) => deleteFromGallery(entry.id, ev));

    row.appendChild(thumb);
    row.appendChild(info);
    row.appendChild(delBtn);
    row.addEventListener("click", () => loadFromGallery(entry.id));
    el.galleryList.appendChild(row);
  });
}

export function startNewGallerySave() {
  state.activeGalleryId = null;
  el.saveName.value = "";
  el.saveName.focus();
  renderGallery();
}
