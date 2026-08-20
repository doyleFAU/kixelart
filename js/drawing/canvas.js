import { ERASER_COLOR } from "../config.js";
import { state } from "../state.js";
import { el } from "../elements.js";
import { clonePixels } from "../utils/pixels.js";
import { saveState, resetHistory } from "../history.js";
import { render, schedulePixelRender } from "../renderer.js";
import { scheduleSave } from "../storage/project.js";
import { addRecentColor } from "../color/picker.js";
import {
  getEllipseParams,
  forEachEllipseOutline,
  forEachEllipseFilled,
  forEachLine,
  forEachRect,
  collectShapePixels,
} from "./shapes.js";

export function setPixel(x, y, color) {
  const { gridSize, mirrorX, mirrorY, pixels } = state;
  const coords = [[x, y]];
  if (mirrorX) coords.push([gridSize - 1 - x, y]);
  if (mirrorY) coords.push([x, gridSize - 1 - y]);
  if (mirrorX && mirrorY) coords.push([gridSize - 1 - x, gridSize - 1 - y]);

  const seen = new Set();
  coords.forEach(([px, py]) => {
    const key = `${px},${py}`;
    if (seen.has(key)) return;
    if (px < 0 || px >= gridSize || py < 0 || py >= gridSize) return;
    seen.add(key);
    pixels[py][px] = color;
  });
}

export function paintBrush(x, y, color) {
  const offset = state.brushSize === 1 ? 0 : Math.floor(state.brushSize / 2);
  for (let dy = 0; dy < state.brushSize; dy++) {
    for (let dx = 0; dx < state.brushSize; dx++) {
      setPixel(x - offset + dx, y - offset + dy, color);
    }
  }
  if (color) addRecentColor(color);
}

export function drawLinePixels(x0, y0, x1, y1, color) {
  forEachLine(x0, y0, x1, y1, (x, y) => paintBrush(x, y, color));
}

export function drawRectPixels(x0, y0, x1, y1, color, filled) {
  forEachRect(x0, y0, x1, y1, filled, (x, y) => setPixel(x, y, color));
  if (color) addRecentColor(color);
}

export function drawCirclePixels(x0, y0, x1, y1, color, filled) {
  const { cx, cy, rx, ry } = getEllipseParams(x0, y0, x1, y1);
  const plot = (x, y) => setPixel(x, y, color);
  if (filled) forEachEllipseFilled(cx, cy, rx, ry, plot);
  else forEachEllipseOutline(cx, cy, rx, ry, plot);
  if (color) addRecentColor(color);
}

export function floodFill(startX, startY, fillColor) {
  const { pixels, gridSize } = state;
  const targetColor = pixels[startY][startX];
  if (targetColor === fillColor) return;
  const stack = [[startX, startY]];
  const visited = new Set();
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
    if (pixels[y][x] !== targetColor) continue;
    visited.add(key);
    setPixel(x, y, fillColor);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  if (fillColor) addRecentColor(fillColor);
}

export function replaceAllColor(fromColor, toColor) {
  if (fromColor === toColor) return;
  saveState();
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      if (state.pixels[y][x] === fromColor) setPixel(x, y, toColor);
    }
  }
  if (toColor) addRecentColor(toColor);
  render();
}

export function createGrid(size, data = null) {
  state.gridSize = size;
  state.pixels = data && data.length === size
    ? clonePixels(data)
    : Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ERASER_COLOR)
      );
  el.canvas.width = size;
  el.canvas.height = size;
  resetHistory();
  render();
  scheduleSave();
}

export function eraseAllPixels() {
  saveState();
  state.pixels = Array.from({ length: state.gridSize }, () =>
    Array.from({ length: state.gridSize }, () => ERASER_COLOR)
  );
  render();
  scheduleSave();
}

export function flipCanvasHorizontal() {
  saveState();
  const { gridSize, pixels } = state;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < Math.floor(gridSize / 2); x++) {
      const tmp = pixels[y][x];
      pixels[y][x] = pixels[y][gridSize - 1 - x];
      pixels[y][gridSize - 1 - x] = tmp;
    }
  }
  render();
}

export function flipCanvasVertical() {
  saveState();
  const { gridSize, pixels } = state;
  for (let y = 0; y < Math.floor(gridSize / 2); y++) {
    for (let x = 0; x < gridSize; x++) {
      const tmp = pixels[y][x];
      pixels[y][x] = pixels[gridSize - 1 - y][x];
      pixels[gridSize - 1 - y][x] = tmp;
    }
  }
  render();
}

export function rotateCanvas90() {
  saveState();
  const old = clonePixels(state.pixels);
  const { gridSize, pixels } = state;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      pixels[x][gridSize - 1 - y] = old[y][x];
    }
  }
  render();
}

export function newCanvas() {
  if (!confirm("Start a new blank canvas?")) return;
  state.activeGalleryId = null;
  el.saveName.value = "";
  state.pixels = Array.from({ length: state.gridSize }, () =>
    Array.from({ length: state.gridSize }, () => ERASER_COLOR)
  );
  resetHistory();
  render();
  scheduleSave();
}

export function getShapePreviewPoints(start, end, tool, filled) {
  return collectShapePixels(
    start.x, start.y, end.x, end.y,
    tool, filled, state.gridSize, state.mirrorX, state.mirrorY
  );
}

export function activeDrawColor() {
  if (state.currentTool === "eraser") return ERASER_COLOR;
  return state.useSecondaryColor ? state.secondaryColor : state.currentColor;
}

export function commitShape(end, filled) {
  const { shapeStart, currentTool } = state;
  if (!shapeStart || !end) return;
  saveState();
  const color = activeDrawColor();
  if (currentTool === "line") {
    drawLinePixels(shapeStart.x, shapeStart.y, end.x, end.y, color);
  } else if (currentTool === "circle") {
    drawCirclePixels(shapeStart.x, shapeStart.y, end.x, end.y, color, filled);
  } else {
    drawRectPixels(shapeStart.x, shapeStart.y, end.x, end.y, color, filled);
  }
  render();
}

export { schedulePixelRender };
