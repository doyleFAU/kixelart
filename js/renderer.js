import { ZOOM_MIN, ZOOM_MAX, ZOOM_ACTUAL } from "./config.js";
import { state } from "./state.js";
import { el } from "./elements.js";

export function updatePreview() {
  const maxPreview = 64;
  const scale = Math.min(maxPreview / state.gridSize, 8);
  const w = Math.round(state.gridSize * scale);
  const h = Math.round(state.gridSize * scale);
  el.previewCanvas.width = w;
  el.previewCanvas.height = h;
  el.previewCtx.clearRect(0, 0, w, h);
  el.previewCtx.imageSmoothingEnabled = false;
  el.previewCtx.drawImage(el.canvas, 0, 0, w, h);
}

export function drawGridOverlay() {
  const displaySize = state.gridSize * state.zoom;
  el.gridOverlay.width = displaySize;
  el.gridOverlay.height = displaySize;
  el.gridOverlay.style.width = `${displaySize}px`;
  el.gridOverlay.style.height = `${displaySize}px`;
  el.previewOverlay.width = displaySize;
  el.previewOverlay.height = displaySize;
  el.previewOverlay.style.width = `${displaySize}px`;
  el.previewOverlay.style.height = `${displaySize}px`;

  el.gridCtx.clearRect(0, 0, displaySize, displaySize);
  if (!state.showGrid) return;

  el.gridCtx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  el.gridCtx.lineWidth = 1;
  for (let i = 0; i <= state.gridSize; i++) {
    const p = i * state.zoom + 0.5;
    el.gridCtx.beginPath();
    el.gridCtx.moveTo(p, 0);
    el.gridCtx.lineTo(p, displaySize);
    el.gridCtx.stroke();
    el.gridCtx.beginPath();
    el.gridCtx.moveTo(0, p);
    el.gridCtx.lineTo(displaySize, p);
    el.gridCtx.stroke();
  }
}

export function applyZoom() {
  const displaySize = state.gridSize * state.zoom;
  el.canvas.style.width = `${displaySize}px`;
  el.canvas.style.height = `${displaySize}px`;
  el.canvasWrap.style.width = `${displaySize}px`;
  el.canvasWrap.style.height = `${displaySize}px`;
  el.checkerboard.style.width = `${displaySize}px`;
  el.checkerboard.style.height = `${displaySize}px`;
  el.zoomLabel.textContent = `${state.zoom}px`;
}

export function renderPixels() {
  const { gridSize, pixels } = state;
  el.ctx.clearRect(0, 0, gridSize, gridSize);
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = pixels[y][x];
      if (color) {
        el.ctx.fillStyle = color;
        el.ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  updatePreview();
}

export function render(redrawGrid = true) {
  renderPixels();
  if (redrawGrid) drawGridOverlay();
  applyZoom();
}

export function setZoom(newZoom) {
  state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  render(true);
}

export function fitZoom() {
  const pad = 48;
  const availW = el.scroll.clientWidth - pad;
  const availH = el.scroll.clientHeight - pad;
  const fit = Math.floor(Math.min(availW / state.gridSize, availH / state.gridSize));
  setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit)));
}

export function zoomActualSize() {
  setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ZOOM_ACTUAL)));
}

export function clearShapePreview() {
  el.previewOverlayCtx.clearRect(0, 0, el.previewOverlay.width, el.previewOverlay.height);
}

export function schedulePixelRender() {
  if (state.drawRaf) return;
  state.drawRaf = requestAnimationFrame(() => {
    state.drawRaf = null;
    renderPixels();
  });
}

export function flushPixelRender() {
  if (state.drawRaf) {
    cancelAnimationFrame(state.drawRaf);
    state.drawRaf = null;
  }
  renderPixels();
}

export function getPixelFromEvent(e, clamp = false) {
  const rect = el.canvas.getBoundingClientRect();
  const scaleX = el.canvas.width / rect.width;
  const scaleY = el.canvas.height / rect.height;
  let x = Math.floor((e.clientX - rect.left) * scaleX);
  let y = Math.floor((e.clientY - rect.top) * scaleY);
  if (clamp) {
    x = Math.max(0, Math.min(state.gridSize - 1, x));
    y = Math.max(0, Math.min(state.gridSize - 1, y));
    return { x, y };
  }
  if (x < 0 || x >= state.gridSize || y < 0 || y >= state.gridSize) return null;
  return { x, y };
}

export function updateCursorPos(e) {
  const pos = getPixelFromEvent(e, false);
  el.cursorPos.textContent = pos ? `${pos.x}, ${pos.y}` : "—";
}

export function updateCursorMode() {
  el.scroll.classList.toggle("hand-tool", state.currentTool === "hand");
  el.scroll.classList.toggle("pan-mode", state.spaceHeld && state.currentTool !== "hand");
}
