import { state } from "../state.js";
import { el, $ } from "../elements.js";
import { undo, redo } from "../history.js";
import {
  render,
  drawGridOverlay,
  fitZoom,
  setZoom,
  zoomActualSize,
  updateCursorMode,
} from "../renderer.js";
import { scheduleSave } from "../storage/project.js";
import {
  createGrid,
  eraseAllPixels,
  flipCanvasHorizontal,
  flipCanvasVertical,
  rotateCanvas90,
  newCanvas,
} from "../drawing/canvas.js";
import {
  setColor,
  swapColors,
  setBrushSize,
  selectTool,
  renderPalette,
} from "../color/picker.js";
import {
  saveToGallery,
  startNewGallerySave,
  renderGallery,
  getGalleryItem,
} from "../storage/gallery.js";

export function bindUI() {
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  });

  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => setBrushSize(parseInt(btn.dataset.size, 10)));
  });

  $("btn-swap-color").addEventListener("click", swapColors);
  el.secondaryColor.addEventListener("click", () => setColor(state.secondaryColor));
  el.secondaryColor.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    swapColors();
  });

  el.scroll.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(state.zoom + (e.deltaY > 0 ? -2 : 2));
  }, { passive: false });

  $("btn-zoom-in").addEventListener("click", () => setZoom(state.zoom + 4));
  $("btn-zoom-out").addEventListener("click", () => setZoom(state.zoom - 4));
  $("btn-zoom-fit").addEventListener("click", fitZoom);
  $("btn-zoom-1x").addEventListener("click", zoomActualSize);
  $("btn-new").addEventListener("click", newCanvas);

  $("btn-save-art").addEventListener("click", saveToGallery);
  $("btn-new-art").addEventListener("click", startNewGallerySave);
  el.saveName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveToGallery();
  });

  $("btn-clear").addEventListener("click", () => {
    if (state.eraseConfirmOpen) return;
    state.eraseConfirmOpen = true;
    const ok = confirm("Are you sure you want to erase all?");
    state.eraseConfirmOpen = false;
    if (ok) eraseAllPixels();
  });

  $("btn-undo").addEventListener("click", () => { if (undo()) render(); scheduleSave(); });
  $("btn-redo").addEventListener("click", () => { if (redo()) render(); scheduleSave(); });

  $("btn-add-color").addEventListener("click", () => {
    if (!state.palette.includes(state.currentColor)) {
      state.palette.push(state.currentColor);
      renderPalette();
      scheduleSave();
    }
  });

  $("show-grid").addEventListener("change", (e) => {
    state.showGrid = e.target.checked;
    drawGridOverlay();
    scheduleSave();
  });

  $("mirror-x").addEventListener("change", (e) => {
    state.mirrorX = e.target.checked;
    scheduleSave();
  });

  $("mirror-y").addEventListener("change", (e) => {
    state.mirrorY = e.target.checked;
    scheduleSave();
  });

  $("export-transparent").addEventListener("change", (e) => {
    state.exportTransparent = e.target.checked;
    scheduleSave();
  });

  $("btn-flip-h").addEventListener("click", flipCanvasHorizontal);
  $("btn-flip-v").addEventListener("click", flipCanvasVertical);
  $("btn-rotate").addEventListener("click", rotateCanvas90);

  $("canvas-size").addEventListener("change", (e) => {
    const newSize = parseInt(e.target.value, 10);
    if (newSize === state.gridSize) return;
    if (!confirm(`Change canvas to ${newSize}×${newSize}? This clears your art.`)) {
      e.target.value = state.gridSize;
      return;
    }
    state.activeGalleryId = null;
    el.saveName.value = "";
    createGrid(newSize);
    fitZoom();
    renderGallery();
  });

  window.addEventListener("resize", fitZoom);
}

export function restoreGallerySelection() {
  if (state.activeGalleryId) {
    const item = getGalleryItem(state.activeGalleryId);
    if (item) el.saveName.value = item.name;
  }
}
