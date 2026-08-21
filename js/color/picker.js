import { MAX_RECENT, ERASER_COLOR } from "../config.js";
import { state } from "../state.js";
import { el } from "../elements.js";
import { updateCursorMode } from "../renderer.js";
import { hsvToRgb, rgbToHex, hexToRgb, rgbToHsv } from "../utils/color.js";
import { safeCssColor, sanitizeHexColor } from "../utils/security.js";

export function updateColorUI() {
  el.currentColor.style.background = state.currentColor;
  el.secondaryColor.style.background = state.secondaryColor;
  el.hexInput.value = state.currentColor;
  updatePaletteSelection();
}

export function setColor(hex, which = "primary") {
  const safe = sanitizeHexColor(hex);
  if (!safe) return;
  const rgb = hexToRgb(safe);
  if (!rgb) return;
  if (which === "secondary") {
    state.secondaryColor = safe;
    el.secondaryColor.style.background = safe;
    return;
  }
  const [h, s, v] = rgbToHsv(...rgb);
  state.wheelHue = h;
  state.wheelSat = s;
  state.wheelBright = v;
  el.brightness.value = Math.round(v * 100);
  updateWheelCursor();
  state.currentColor = safe;
  updateColorUI();
}

export function updateColorFromWheel() {
  const [r, g, b] = hsvToRgb(state.wheelHue, state.wheelSat, state.wheelBright);
  state.currentColor = rgbToHex(r, g, b);
  updateColorUI();
}

export function swapColors() {
  const tmp = state.currentColor;
  state.currentColor = state.secondaryColor;
  state.secondaryColor = tmp;
  setColor(state.currentColor);
  el.secondaryColor.style.background = state.secondaryColor;
}

export function addRecentColor(color) {
  const safe = sanitizeHexColor(color);
  if (!safe || safe === ERASER_COLOR) return;
  state.recentColors = state.recentColors.filter(
    (c) => c.toLowerCase() !== safe.toLowerCase()
  );
  state.recentColors.unshift(safe);
  if (state.recentColors.length > MAX_RECENT) state.recentColors.pop();
  renderRecentColors();
}

export function renderRecentColors() {
  el.recentColors.replaceChildren();
  if (state.recentColors.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-recent";
    empty.textContent = "Draw to build history";
    el.recentColors.appendChild(empty);
    return;
  }
  state.recentColors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.style.background = safeCssColor(color, "#000000");
    swatch.title = safeCssColor(color, "#000000");
    swatch.addEventListener("click", () => setColor(color));
    el.recentColors.appendChild(swatch);
  });
}

export function renderPalette() {
  el.palette.replaceChildren();
  state.palette.forEach((color) => {
    const safe = safeCssColor(color, "#000000");
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "palette-swatch";
    swatch.style.background = safe;
    swatch.title = safe;
    if (safe.toLowerCase() === state.currentColor.toLowerCase()) {
      swatch.classList.add("active");
    }
    swatch.addEventListener("click", () => setColor(safe));
    el.palette.appendChild(swatch);
  });
}

export function updatePaletteSelection() {
  el.palette.querySelectorAll(".palette-swatch").forEach((node) => {
    node.classList.toggle(
      "active",
      node.title.toLowerCase() === state.currentColor.toLowerCase()
    );
  });
}

export function drawColorWheel() {
  const w = el.colorWheel.width;
  const h = el.colorWheel.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = w / 2;
  const imageData = el.wheelCtx.createImageData(w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * w + x) * 4;
      if (dist <= radius) {
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const sat = dist / radius;
        const [r, g, b] = hsvToRgb(angle, sat, 1);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      } else {
        data[idx + 3] = 0;
      }
    }
  }
  el.wheelCtx.putImageData(imageData, 0, 0);
}

export function updateWheelCursor() {
  const w = el.colorWheel.width;
  const cx = w / 2;
  const radius = w / 2 - 2;
  const angle = (state.wheelHue * Math.PI) / 180;
  const dist = state.wheelSat * radius;
  el.wheelCursor.style.left = `${cx + Math.cos(angle) * dist}px`;
  el.wheelCursor.style.top = `${cx + Math.sin(angle) * dist}px`;
}

export function pickFromWheel(e) {
  const rect = el.colorWheel.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cx = el.colorWheel.width / 2;
  const cy = el.colorWheel.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radius = el.colorWheel.width / 2;
  if (dist > radius) return;
  state.wheelHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  state.wheelSat = Math.min(dist / radius, 1);
  updateWheelCursor();
  updateColorFromWheel();
}

export function bindColorWheel() {
  el.colorWheel.addEventListener("mousedown", (e) => {
    pickFromWheel(e);
    const onMove = (ev) => pickFromWheel(ev);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  el.brightness.addEventListener("input", () => {
    state.wheelBright = el.brightness.value / 100;
    updateColorFromWheel();
  });

  el.hexInput.addEventListener("change", () => {
    let val = el.hexInput.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setColor(val);
    else el.hexInput.value = state.currentColor;
  });
}

export function setBrushSize(size) {
  state.brushSize = size;
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.size, 10) === size);
  });
}

import { sanitizeToolName } from "../utils/security.js";

export function selectTool(name) {
  state.currentTool = sanitizeToolName(name);
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === state.currentTool);
  });
  updateCursorMode();
}
