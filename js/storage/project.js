import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  DEFAULT_PALETTE,
} from "../config.js";
import { state } from "../state.js";
import { el, $ } from "../elements.js";
import { clonePixels } from "../utils/pixels.js";
import { resetHistory } from "../history.js";
import { render } from "../renderer.js";
import {
  setColor,
  setBrushSize,
  renderPalette,
  renderRecentColors,
} from "../color/picker.js";

export function scheduleSave() {
  el.saveStatus.textContent = "Saving…";
  el.saveStatus.className = "save-status unsaved";
  clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(saveProject, 600);
}

export function saveProject() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      gridSize: state.gridSize,
      pixels: state.pixels,
      palette: state.palette,
      recentColors: state.recentColors,
      currentColor: state.currentColor,
      secondaryColor: state.secondaryColor,
      showGrid: state.showGrid,
      mirrorX: state.mirrorX,
      mirrorY: state.mirrorY,
      exportTransparent: state.exportTransparent,
      brushSize: state.brushSize,
      activeGalleryId: state.activeGalleryId,
    }));
    el.saveStatus.textContent = "Saved";
    el.saveStatus.className = "save-status saved";
  } catch {
    el.saveStatus.textContent = "Save failed";
    el.saveStatus.className = "save-status unsaved";
  }
}

export function applyProjectData(data) {
  state.gridSize = data.gridSize;
  state.pixels = clonePixels(data.pixels);
  state.palette = data.palette || [...DEFAULT_PALETTE];
  state.recentColors = data.recentColors || [];
  state.currentColor = data.currentColor || "#ff0040";
  state.secondaryColor = data.secondaryColor || "#0066ff";
  state.showGrid = data.showGrid !== false;
  state.mirrorX = !!data.mirrorX;
  state.mirrorY = !!data.mirrorY;
  state.exportTransparent = data.exportTransparent !== false;
  state.brushSize = data.brushSize || 1;

  el.canvas.width = state.gridSize;
  el.canvas.height = state.gridSize;
  $("canvas-size").value = String(state.gridSize);
  $("show-grid").checked = state.showGrid;
  $("mirror-x").checked = state.mirrorX;
  $("mirror-y").checked = state.mirrorY;
  $("export-transparent").checked = state.exportTransparent;
  setBrushSize(state.brushSize);
  resetHistory();
  renderPalette();
  renderRecentColors();
  setColor(state.currentColor);
  el.secondaryColor.style.background = state.secondaryColor;
  render();
}

export function loadProject() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.pixels || !data.gridSize) return false;

    applyProjectData(data);
    state.activeGalleryId = data.activeGalleryId || null;
    return true;
  } catch {
    return false;
  }
}
