import { state } from "../state.js";
import { el } from "../elements.js";
import { saveState } from "../history.js";
import {
  render,
  getPixelFromEvent,
  updateCursorPos,
  clearShapePreview,
  schedulePixelRender,
  flushPixelRender,
} from "../renderer.js";
import {
  activeDrawColor,
  paintBrush,
  drawLinePixels,
  floodFill,
  replaceAllColor,
  commitShape,
  getShapePreviewPoints,
} from "../drawing/canvas.js";
import { setColor } from "../color/picker.js";

const SHAPE_TOOLS = new Set(["line", "rect", "circle"]);

function shouldPan(e) {
  if (e.button === 1) return true;
  if (e.button !== 0) return false;
  return state.currentTool === "hand" || state.spaceHeld;
}

function isCanvasTarget(e) {
  return el.canvasWrap.contains(e.target);
}

function startPan(e) {
  el.scroll.classList.add("panning");
  state.panStart = {
    x: e.clientX,
    y: e.clientY,
    scrollLeft: el.scroll.scrollLeft,
    scrollTop: el.scroll.scrollTop,
  };
}

function updatePan(e) {
  el.scroll.scrollLeft = state.panStart.scrollLeft - (e.clientX - state.panStart.x);
  el.scroll.scrollTop = state.panStart.scrollTop - (e.clientY - state.panStart.y);
}

function endPan() {
  el.scroll.classList.remove("panning");
}

function drawShapePreview(start, end) {
  clearShapePreview();
  if (!start || !end) return;
  const filledShape = (state.currentTool === "rect" || state.currentTool === "circle") && state.shiftHeld;
  const points = getShapePreviewPoints(start, end, state.currentTool, filledShape);
  const color = activeDrawColor() || "#ffffff";
  el.previewOverlayCtx.fillStyle = color + "99";
  points.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    el.previewOverlayCtx.fillRect(x * state.zoom, y * state.zoom, state.zoom, state.zoom);
  });
}

function handleDraw(e) {
  const pos = getPixelFromEvent(e, true);
  const color = activeDrawColor();

  if (state.currentTool === "picker") {
    const exact = getPixelFromEvent(e, false);
    if (!exact) return;
    const picked = state.pixels[exact.y][exact.x];
    if (picked) setColor(picked, state.useSecondaryColor ? "secondary" : "primary");
    return;
  }

  if (state.currentTool === "fill") {
    const exact = getPixelFromEvent(e, false);
    if (!exact || state.strokeStarted) return;
    state.strokeStarted = true;
    saveState();
    floodFill(exact.x, exact.y, color);
    render();
    return;
  }

  if (state.currentTool === "replace") {
    const exact = getPixelFromEvent(e, false);
    if (!exact || state.strokeStarted) return;
    state.strokeStarted = true;
    const target = state.pixels[exact.y][exact.x];
    if (target !== color) replaceAllColor(target, color);
    return;
  }

  if (!state.strokeStarted) {
    state.strokeStarted = true;
    saveState();
  }

  if (state.lastPixel && (state.lastPixel.x !== pos.x || state.lastPixel.y !== pos.y)) {
    drawLinePixels(state.lastPixel.x, state.lastPixel.y, pos.x, pos.y, color);
  } else {
    paintBrush(pos.x, pos.y, color);
  }

  state.lastPixel = pos;
  schedulePixelRender();
}

function endStroke() {
  flushPixelRender();
  state.strokeStarted = false;
  state.isDrawing = false;
  state.lastPixel = null;
}

function endInteraction() {
  if (state.interactionMode === "pan") endPan();
  if (state.interactionMode === "shape") {
    clearShapePreview();
    state.shapeStart = null;
  }
  if (state.interactionMode === "draw") endStroke();
  state.activePointerId = null;
  state.interactionMode = null;
  state.useSecondaryColor = false;
}

function onPointerDown(e) {
  if (state.activePointerId !== null) return;
  if (e.button > 2) return;

  state.useSecondaryColor = e.button === 2;
  const onCanvas = isCanvasTarget(e);

  if (shouldPan(e) && (onCanvas || e.target === el.scroll)) {
    state.activePointerId = e.pointerId;
    state.interactionMode = "pan";
    startPan(e);
    el.scroll.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (!onCanvas) return;
  if (state.currentTool === "hand") return;
  if (e.button !== 0 && e.button !== 2) return;

  if (SHAPE_TOOLS.has(state.currentTool)) {
    const start = getPixelFromEvent(e, false);
    if (!start) return;
    state.activePointerId = e.pointerId;
    state.interactionMode = "shape";
    state.shapeStart = start;
    el.scroll.setPointerCapture(e.pointerId);
    drawShapePreview(state.shapeStart, start);
    e.preventDefault();
    return;
  }

  state.activePointerId = e.pointerId;
  state.interactionMode = "draw";
  state.isDrawing = true;
  state.lastPixel = null;
  el.scroll.setPointerCapture(e.pointerId);
  handleDraw(e);
  e.preventDefault();
}

function onPointerMove(e) {
  if (e.pointerId !== state.activePointerId) return;

  if (state.interactionMode === "pan") {
    updatePan(e);
    e.preventDefault();
    return;
  }

  if (state.interactionMode === "shape" && state.shapeStart) {
    drawShapePreview(state.shapeStart, getPixelFromEvent(e, true));
    e.preventDefault();
    return;
  }

  if (state.interactionMode === "draw" && state.isDrawing) {
    if (state.currentTool === "brush" || state.currentTool === "eraser") {
      handleDraw(e);
    }
    e.preventDefault();
  }
}

function onPointerUp(e) {
  if (e.pointerId !== state.activePointerId) return;

  if (state.interactionMode === "shape" && state.shapeStart) {
    const end = getPixelFromEvent(e, true);
    const filled = (state.currentTool === "rect" || state.currentTool === "circle") && state.shiftHeld;
    commitShape(end, filled);
    clearShapePreview();
    state.shapeStart = null;
  }

  endInteraction();
  if (el.scroll.hasPointerCapture(e.pointerId)) {
    el.scroll.releasePointerCapture(e.pointerId);
  }
}

function onPointerCancel(e) {
  if (e.pointerId !== state.activePointerId) return;
  endInteraction();
}

export function bindPointerInput() {
  el.scroll.addEventListener("pointerdown", onPointerDown);
  el.scroll.addEventListener("pointermove", (e) => {
    if (isCanvasTarget(e)) updateCursorPos(e);
    onPointerMove(e);
  });
  el.scroll.addEventListener("pointerleave", () => {
    el.cursorPos.textContent = "—";
  });
  el.scroll.addEventListener("pointerup", onPointerUp);
  el.scroll.addEventListener("pointercancel", onPointerCancel);
  el.canvasWrap.addEventListener("contextmenu", (e) => e.preventDefault());
  el.scroll.addEventListener("dragstart", (e) => e.preventDefault());
  window.addEventListener("blur", endInteraction);
}

export { endInteraction };
