(() => {
  "use strict";

  const DEFAULT_PALETTE = [
    "#000000", "#ffffff", "#ff0040", "#ff6b00", "#ffcc00", "#88ff00",
    "#00ff88", "#00ccff", "#0066ff", "#8800ff", "#ff00cc", "#8b4513",
    "#c0c0c0", "#808080", "#404040", "#ff8888", "#88ff88", "#8888ff",
    "#ffff88", "#ff88ff", "#88ffff", "#2d1b0e", "#4a3728", "#6b5344",
    "#1a1a2e", "#16213e", "#0f3460", "#533483", "#e94560", "#f5f5dc",
    "#deb887", "#d2691e", "#228b22", "#006400", "#191970", "#483d8b",
  ];

  const ERASER_COLOR = null;
  const MAX_HISTORY = 50;
  const STORAGE_KEY = "kixelart-v1";
  const LEGACY_STORAGE_KEY = "pixel-studio-v1";
  const GALLERY_INDEX_KEY = "kixelart-gallery-index";
  const GALLERY_ITEM_PREFIX = "kixelart-gallery-";
  const MAX_GALLERY_ITEMS = 40;
  const MAX_RECENT = 12;

  let gridSize = 32;
  let pixels = [];
  let currentColor = "#ff0040";
  let secondaryColor = "#0066ff";
  let currentTool = "brush";
  let brushSize = 1;
  let zoom = 16;
  let showGrid = true;
  let mirrorX = false;
  let mirrorY = false;
  let exportTransparent = true;
  let isDrawing = false;
  let spaceHeld = false;
  let shiftHeld = false;
  let lastPixel = null;
  let activePointerId = null;
  let interactionMode = null;
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
  let shapeStart = null;
  let useSecondaryColor = false;
  let wheelHue = 0;
  let wheelSat = 1;
  let wheelBright = 1;
  let palette = [...DEFAULT_PALETTE];
  let recentColors = [];
  let history = [];
  let historyIndex = -1;
  let saveTimeout = null;
  let activeGalleryId = null;

  const canvas = document.getElementById("pixel-canvas");
  const ctx = canvas.getContext("2d");
  const scrollEl = document.getElementById("canvas-scroll");
  const canvasWrap = document.getElementById("canvas-wrap");
  const gridOverlay = document.getElementById("grid-overlay");
  const gridCtx = gridOverlay.getContext("2d");
  const previewOverlay = document.getElementById("preview-overlay");
  const previewOverlayCtx = previewOverlay.getContext("2d");
  const previewCanvas = document.getElementById("preview-canvas");
  const previewCtx = previewCanvas.getContext("2d");
  const colorWheel = document.getElementById("color-wheel");
  const wheelCtx = colorWheel.getContext("2d");
  const wheelCursor = document.getElementById("wheel-cursor");
  const brightnessInput = document.getElementById("brightness");
  const currentColorEl = document.getElementById("current-color");
  const secondaryColorEl = document.getElementById("secondary-color");
  const hexInput = document.getElementById("hex-input");
  const paletteEl = document.getElementById("palette");
  const recentColorsEl = document.getElementById("recent-colors");
  const zoomLabel = document.getElementById("zoom-label");
  const saveStatusEl = document.getElementById("save-status");
  const galleryListEl = document.getElementById("gallery-list");
  const saveNameInput = document.getElementById("save-name");
  const cursorPosEl = document.getElementById("cursor-pos");

  let strokeStarted = false;
  let drawRaf = null;

  // --- Color utilities ---

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return [h, s, v];
  }

  function updateColorUI() {
    currentColorEl.style.background = currentColor;
    secondaryColorEl.style.background = secondaryColor;
    hexInput.value = currentColor;
    updatePaletteSelection();
  }

  function updateColorFromWheel() {
    const [r, g, b] = hsvToRgb(wheelHue, wheelSat, wheelBright);
    currentColor = rgbToHex(r, g, b);
    updateColorUI();
  }

  function setColor(hex, which = "primary") {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    if (which === "secondary") {
      secondaryColor = hex;
      secondaryColorEl.style.background = hex;
      return;
    }
    const [h, s, v] = rgbToHsv(...rgb);
    wheelHue = h;
    wheelSat = s;
    wheelBright = v;
    brightnessInput.value = Math.round(v * 100);
    updateWheelCursor();
    currentColor = hex;
    updateColorUI();
  }

  function swapColors() {
    const tmp = currentColor;
    currentColor = secondaryColor;
    secondaryColor = tmp;
    setColor(currentColor);
    secondaryColorEl.style.background = secondaryColor;
  }

  function addRecentColor(color) {
    if (!color || color === ERASER_COLOR) return;
    recentColors = recentColors.filter((c) => c.toLowerCase() !== color.toLowerCase());
    recentColors.unshift(color);
    if (recentColors.length > MAX_RECENT) recentColors.pop();
    renderRecentColors();
  }

  function renderRecentColors() {
    recentColorsEl.innerHTML = "";
    if (recentColors.length === 0) {
      recentColorsEl.innerHTML = '<span class="empty-recent">Draw to build history</span>';
      return;
    }
    recentColors.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.className = "palette-swatch";
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener("click", () => setColor(color));
      recentColorsEl.appendChild(swatch);
    });
  }

  function activeDrawColor() {
    if (currentTool === "eraser") return ERASER_COLOR;
    return useSecondaryColor ? secondaryColor : currentColor;
  }

  // --- Color wheel ---

  function drawColorWheel() {
    const w = colorWheel.width;
    const h = colorWheel.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w / 2;
    const imageData = wheelCtx.createImageData(w, h);
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
    wheelCtx.putImageData(imageData, 0, 0);
  }

  function updateWheelCursor() {
    const w = colorWheel.width;
    const cx = w / 2;
    const radius = w / 2 - 2;
    const angle = (wheelHue * Math.PI) / 180;
    const dist = wheelSat * radius;
    wheelCursor.style.left = `${cx + Math.cos(angle) * dist}px`;
    wheelCursor.style.top = `${cx + Math.sin(angle) * dist}px`;
  }

  function pickFromWheel(e) {
    const rect = colorWheel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = colorWheel.width / 2;
    const cy = colorWheel.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = colorWheel.width / 2;
    if (dist > radius) return;
    wheelHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    wheelSat = Math.min(dist / radius, 1);
    updateWheelCursor();
    updateColorFromWheel();
  }

  // --- Pixel grid ---

  function createGrid(size, data = null) {
    gridSize = size;
    if (data && data.length === size) {
      pixels = clonePixels(data);
    } else {
      pixels = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ERASER_COLOR)
      );
    }
    canvas.width = size;
    canvas.height = size;
    resetHistory();
    render();
    scheduleSave();
  }

  function clonePixels(data) {
    return data.map((row) => [...row]);
  }

  function saveState() {
    history = history.slice(0, historyIndex + 1);
    history.push(clonePixels(pixels));
    if (history.length > MAX_HISTORY) history.shift();
    else historyIndex++;
    scheduleSave();
  }

  function resetHistory() {
    history = [clonePixels(pixels)];
    historyIndex = 0;
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    pixels = clonePixels(history[historyIndex]);
    render();
    scheduleSave();
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++;
    pixels = clonePixels(history[historyIndex]);
    render();
    scheduleSave();
  }

  function getPixelFromEvent(e, clamp = false) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x = Math.floor((e.clientX - rect.left) * scaleX);
    let y = Math.floor((e.clientY - rect.top) * scaleY);
    if (clamp) {
      x = Math.max(0, Math.min(gridSize - 1, x));
      y = Math.max(0, Math.min(gridSize - 1, y));
      return { x, y };
    }
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return null;
    return { x, y };
  }

  function setPixel(x, y, color) {
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

  function paintBrush(x, y, color) {
    const offset = brushSize === 1 ? 0 : Math.floor(brushSize / 2);
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        setPixel(x - offset + dx, y - offset + dy, color);
      }
    }
    if (color) addRecentColor(color);
  }

  function drawLinePixels(x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      paintBrush(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  function drawRectPixels(x0, y0, x1, y1, color, filled) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    if (filled) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          setPixel(x, y, color);
        }
      }
    } else {
      for (let x = minX; x <= maxX; x++) {
        setPixel(x, minY, color);
        setPixel(x, maxY, color);
      }
      for (let y = minY; y <= maxY; y++) {
        setPixel(minX, y, color);
        setPixel(maxX, y, color);
      }
    }
    if (color) addRecentColor(color);
  }

  function getEllipseParams(x0, y0, x1, y1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    return {
      cx: Math.round((minX + maxX) / 2),
      cy: Math.round((minY + maxY) / 2),
      rx: Math.max(Math.round((maxX - minX) / 2), 1),
      ry: Math.max(Math.round((maxY - minY) / 2), 1),
    };
  }

  function plotEllipseSymmetric(cx, cy, x, y, fn) {
    fn(cx + x, cy + y);
    fn(cx - x, cy + y);
    fn(cx + x, cy - y);
    fn(cx - x, cy - y);
  }

  function forEachCircleOutline(cx, cy, r, fn) {
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      plotEllipseSymmetric(cx, cy, x, y, fn);
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  function forEachEllipseOutline(cx, cy, rx, ry, fn) {
    if (rx === ry) {
      forEachCircleOutline(cx, cy, rx, fn);
      return;
    }

    let x = 0;
    let y = ry;
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    const twoRx2 = 2 * rx2;
    const twoRy2 = 2 * ry2;
    let px = 0;
    let py = twoRx2 * y;
    let p = Math.round(ry2 - rx2 * ry + 0.25 * rx2);

    while (px <= py) {
      plotEllipseSymmetric(cx, cy, x, y, fn);
      x++;
      px += twoRy2;
      if (p < 0) {
        p += ry2 + px;
      } else {
        y--;
        py -= twoRx2;
        p += ry2 + px - py;
      }
    }

    p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2);
    while (y >= 0) {
      plotEllipseSymmetric(cx, cy, x, y, fn);
      y--;
      py -= twoRx2;
      if (p > 0) {
        p += rx2 - py;
      } else {
        x++;
        px += twoRy2;
        p += rx2 - py + px;
      }
    }
  }

  function forEachEllipseFilled(cx, cy, rx, ry, fn) {
    const ry2 = ry * ry;
    for (let dy = -ry; dy <= ry; dy++) {
      const y = cy + dy;
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ry2)));
      for (let x = cx - dx; x <= cx + dx; x++) {
        fn(x, y);
      }
    }
  }

  function drawCirclePixels(x0, y0, x1, y1, color, filled) {
    const { cx, cy, rx, ry } = getEllipseParams(x0, y0, x1, y1);
    const plot = (x, y) => setPixel(x, y, color);
    if (filled) {
      forEachEllipseFilled(cx, cy, rx, ry, plot);
    } else {
      forEachEllipseOutline(cx, cy, rx, ry, plot);
    }
    if (color) addRecentColor(color);
  }

  function replaceAllColor(fromColor, toColor) {
    if (fromColor === toColor) return;
    saveState();
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (pixels[y][x] === fromColor) setPixel(x, y, toColor);
      }
    }
    if (toColor) addRecentColor(toColor);
    render();
  }

  function flipCanvasHorizontal() {
    saveState();
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < Math.floor(gridSize / 2); x++) {
        const tmp = pixels[y][x];
        pixels[y][x] = pixels[y][gridSize - 1 - x];
        pixels[y][gridSize - 1 - x] = tmp;
      }
    }
    render();
  }

  function flipCanvasVertical() {
    saveState();
    for (let y = 0; y < Math.floor(gridSize / 2); y++) {
      for (let x = 0; x < gridSize; x++) {
        const tmp = pixels[y][x];
        pixels[y][x] = pixels[gridSize - 1 - y][x];
        pixels[gridSize - 1 - y][x] = tmp;
      }
    }
    render();
  }

  function rotateCanvas90() {
    saveState();
    const old = clonePixels(pixels);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        pixels[x][gridSize - 1 - y] = old[y][x];
      }
    }
    render();
  }

  function newCanvas() {
    if (!confirm("Start a new blank canvas?")) return;
    activeGalleryId = null;
    saveNameInput.value = "";
    pixels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ERASER_COLOR)
    );
    resetHistory();
    render();
    scheduleSave();
    renderGallery();
  }

  function getShapePixels(x0, y0, x1, y1, tool, filled) {
    const points = new Set();
    const add = (x, y) => {
      if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
        points.add(`${x},${y}`);
        if (mirrorX) points.add(`${gridSize - 1 - x},${y}`);
        if (mirrorY) points.add(`${x},${gridSize - 1 - y}`);
        if (mirrorX && mirrorY) points.add(`${gridSize - 1 - x},${gridSize - 1 - y}`);
      }
    };

    if (tool === "line") {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let cx = x0, cy = y0;
      while (true) {
        add(cx, cy);
        if (cx === x1 && cy === y1) break;
        const e2 = err * 2;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
      }
    } else if (tool === "circle") {
      const { cx, cy, rx, ry } = getEllipseParams(x0, y0, x1, y1);
      const plot = (x, y) => add(x, y);
      if (filled) {
        forEachEllipseFilled(cx, cy, rx, ry, plot);
      } else {
        forEachEllipseOutline(cx, cy, rx, ry, plot);
      }
    } else {
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      if (filled) {
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) add(x, y);
      } else {
        for (let x = minX; x <= maxX; x++) { add(x, minY); add(x, maxY); }
        for (let y = minY; y <= maxY; y++) { add(minX, y); add(maxX, y); }
      }
    }
    return points;
  }

  function floodFill(startX, startY, fillColor) {
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

  function render(redrawGrid = true) {
    ctx.clearRect(0, 0, gridSize, gridSize);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = pixels[y][x];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    if (redrawGrid) drawGridOverlay();
    applyZoom();
    updatePreview();
  }

  function renderPixels() {
    ctx.clearRect(0, 0, gridSize, gridSize);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = pixels[y][x];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    updatePreview();
  }

  function updatePreview() {
    const maxPreview = 64;
    const scale = Math.min(maxPreview / gridSize, 8);
    const w = Math.round(gridSize * scale);
    const h = Math.round(gridSize * scale);
    previewCanvas.width = w;
    previewCanvas.height = h;
    previewCtx.clearRect(0, 0, w, h);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(canvas, 0, 0, w, h);
  }

  function drawGridOverlay() {
    const displaySize = gridSize * zoom;
    gridOverlay.width = displaySize;
    gridOverlay.height = displaySize;
    gridOverlay.style.width = `${displaySize}px`;
    gridOverlay.style.height = `${displaySize}px`;
    previewOverlay.width = displaySize;
    previewOverlay.height = displaySize;
    previewOverlay.style.width = `${displaySize}px`;
    previewOverlay.style.height = `${displaySize}px`;

    gridCtx.clearRect(0, 0, displaySize, displaySize);
    if (!showGrid) return;

    gridCtx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    gridCtx.lineWidth = 1;
    for (let i = 0; i <= gridSize; i++) {
      const p = i * zoom + 0.5;
      gridCtx.beginPath();
      gridCtx.moveTo(p, 0);
      gridCtx.lineTo(p, displaySize);
      gridCtx.stroke();
      gridCtx.beginPath();
      gridCtx.moveTo(0, p);
      gridCtx.lineTo(displaySize, p);
      gridCtx.stroke();
    }
  }

  function clearShapePreview() {
    previewOverlayCtx.clearRect(0, 0, previewOverlay.width, previewOverlay.height);
  }

  function drawShapePreview(start, end) {
    clearShapePreview();
    if (!start || !end) return;
    const filled = (currentTool === "rect" || currentTool === "circle") && shiftHeld;
    const points = getShapePixels(start.x, start.y, end.x, end.y, currentTool, filled);
    const color = activeDrawColor() || "#ffffff";

    previewOverlayCtx.fillStyle = color + "99";
    points.forEach((key) => {
      const [x, y] = key.split(",").map(Number);
      previewOverlayCtx.fillRect(x * zoom, y * zoom, zoom, zoom);
    });
  }

  function applyZoom() {
    const displaySize = gridSize * zoom;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    canvasWrap.style.width = `${displaySize}px`;
    canvasWrap.style.height = `${displaySize}px`;
    document.getElementById("checkerboard").style.width = `${displaySize}px`;
    document.getElementById("checkerboard").style.height = `${displaySize}px`;
    zoomLabel.textContent = `${zoom}px`;
  }

  function setZoom(newZoom) {
    zoom = Math.max(4, Math.min(64, newZoom));
    render(true);
  }

  function fitZoom() {
    const pad = 48;
    const availW = scrollEl.clientWidth - pad;
    const availH = scrollEl.clientHeight - pad;
    const fit = Math.floor(Math.min(availW / gridSize, availH / gridSize));
    setZoom(Math.max(4, Math.min(64, fit)));
  }

  function zoomActualSize() {
    setZoom(Math.max(4, Math.min(64, 16)));
  }

  function updateCursorPos(e) {
    const pos = getPixelFromEvent(e, false);
    cursorPosEl.textContent = pos ? `${pos.x}, ${pos.y}` : "—";
  }

  function setBrushSize(size) {
    brushSize = size;
    document.querySelectorAll(".size-btn").forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.dataset.size, 10) === size);
    });
  }

  // --- Save / load ---

  function scheduleSave() {
    saveStatusEl.textContent = "Saving…";
    saveStatusEl.className = "save-status unsaved";
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveProject, 600);
  }

  function saveProject() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gridSize,
        pixels,
        palette,
        recentColors,
        currentColor,
        secondaryColor,
        showGrid,
        mirrorX,
        mirrorY,
        exportTransparent,
        brushSize,
        activeGalleryId,
      }));
      saveStatusEl.textContent = "Saved";
      saveStatusEl.className = "save-status saved";
    } catch {
      saveStatusEl.textContent = "Save failed";
      saveStatusEl.className = "save-status unsaved";
    }
  }

  function loadProject() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.pixels || !data.gridSize) return false;

      applyProjectData(data);
      activeGalleryId = data.activeGalleryId || null;
      if (activeGalleryId) {
        const item = getGalleryItem(activeGalleryId);
        if (item) saveNameInput.value = item.name;
      }
      renderGallery();
      return true;
    } catch {
      return false;
    }
  }

  function applyProjectData(data) {
    gridSize = data.gridSize;
    pixels = clonePixels(data.pixels);
    palette = data.palette || [...DEFAULT_PALETTE];
    recentColors = data.recentColors || [];
    currentColor = data.currentColor || "#ff0040";
    secondaryColor = data.secondaryColor || "#0066ff";
    showGrid = data.showGrid !== false;
    mirrorX = !!data.mirrorX;
    mirrorY = !!data.mirrorY;
    exportTransparent = data.exportTransparent !== false;
    brushSize = data.brushSize || 1;

    canvas.width = gridSize;
    canvas.height = gridSize;
    document.getElementById("canvas-size").value = String(gridSize);
    document.getElementById("show-grid").checked = showGrid;
    document.getElementById("mirror-x").checked = mirrorX;
    document.getElementById("mirror-y").checked = mirrorY;
    document.getElementById("export-transparent").checked = exportTransparent;
    setBrushSize(brushSize);
    resetHistory();
    renderPalette();
    renderRecentColors();
    setColor(currentColor);
    secondaryColorEl.style.background = secondaryColor;
    render();
  }

  // --- My Art gallery ---

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

  function getGalleryItem(id) {
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
    tctx.drawImage(canvas, 0, 0, size, size);
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

  function saveToGallery() {
    const name = saveNameInput.value.trim() || `Art ${Date.now()}`;
    const now = Date.now();
    const id = activeGalleryId || `art-${now}`;
    const isUpdate = !!activeGalleryId && getGalleryItem(activeGalleryId);

    const item = {
      id,
      name,
      createdAt: isUpdate ? (getGalleryItem(id)?.createdAt || now) : now,
      updatedAt: now,
      gridSize,
      pixels: clonePixels(pixels),
      palette: [...palette],
      recentColors: [...recentColors],
      currentColor,
      secondaryColor,
      showGrid,
      mirrorX,
      brushSize,
      thumbnail: makeThumbnailDataUrl(),
    };

    try {
      let index = getGalleryIndex();

      if (isUpdate) {
        const idx = index.findIndex((e) => e.id === id);
        if (idx >= 0) {
          index[idx] = {
            id,
            name,
            updatedAt: now,
            gridSize,
            thumbnail: item.thumbnail,
          };
        } else {
          index.unshift({
            id,
            name,
            updatedAt: now,
            gridSize,
            thumbnail: item.thumbnail,
          });
        }
      } else {
        if (index.length >= MAX_GALLERY_ITEMS) {
          const removed = index.pop();
          if (removed) removeGalleryItem(removed.id);
        }
        index.unshift({
          id,
          name,
          updatedAt: now,
          gridSize,
          thumbnail: item.thumbnail,
        });
        activeGalleryId = id;
      }

      setGalleryItem(id, item);
      setGalleryIndex(index);
      saveNameInput.value = name;
      renderGallery();
      scheduleSave();

      saveStatusEl.textContent = isUpdate ? "Art updated" : "Art saved";
      saveStatusEl.className = "save-status saved";
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

    activeGalleryId = id;
    applyProjectData(item);
    saveNameInput.value = item.name;
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

    if (activeGalleryId === id) {
      activeGalleryId = null;
      saveNameInput.value = "";
    }

    renderGallery();
    scheduleSave();
  }

  function renderGallery() {
    const index = getGalleryIndex();
    galleryListEl.innerHTML = "";

    index.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "gallery-item";
      if (entry.id === activeGalleryId) row.classList.add("active");

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
      delBtn.addEventListener("click", (e) => deleteFromGallery(entry.id, e));

      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(delBtn);
      row.addEventListener("click", () => loadFromGallery(entry.id));

      galleryListEl.appendChild(row);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function eraseAllPixels() {
    saveState();
    pixels = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ERASER_COLOR)
    );
    render();
    scheduleSave();
  }

  // --- Import / export ---

  function downloadPNG() {
    const scale = parseInt(document.getElementById("export-scale").value, 10) || 1;
    const transparent = document.getElementById("export-transparent").checked;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = gridSize * scale;
    exportCanvas.height = gridSize * scale;
    const ectx = exportCanvas.getContext("2d");
    ectx.imageSmoothingEnabled = false;

    if (!transparent) {
      ectx.fillStyle = "#ffffff";
      ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    const temp = document.createElement("canvas");
    temp.width = gridSize;
    temp.height = gridSize;
    const tctx = temp.getContext("2d");
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = pixels[y][x];
        if (color) {
          tctx.fillStyle = color;
          tctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ectx.drawImage(temp, 0, 0, exportCanvas.width, exportCanvas.height);

    const link = document.createElement("a");
    link.download = `kixelart-${gridSize}x${gridSize}-${scale}x-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  function importImage(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const temp = document.createElement("canvas");
        temp.width = gridSize;
        temp.height = gridSize;
        const tctx = temp.getContext("2d");
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(img, 0, 0, gridSize, gridSize);
        const imageData = tctx.getImageData(0, 0, gridSize, gridSize).data;

        saveState();
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const i = (y * gridSize + x) * 4;
            const a = imageData[i + 3];
            if (a < 128) {
              pixels[y][x] = ERASER_COLOR;
            } else {
              pixels[y][x] = rgbToHex(imageData[i], imageData[i + 1], imageData[i + 2]);
            }
          }
        }
        render();
        scheduleSave();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Pointer interactions ---

  function shouldPan(e) {
    if (e.button === 1) return true;
    if (e.button !== 0) return false;
    return currentTool === "hand" || spaceHeld;
  }

  function isCanvasTarget(e) {
    return canvasWrap.contains(e.target);
  }

  function startPan(e) {
    scrollEl.classList.add("panning");
    panStart = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
    };
  }

  function updatePan(e) {
    scrollEl.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
    scrollEl.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
  }

  function endPan() {
    scrollEl.classList.remove("panning");
  }

  function updateCursorMode() {
    scrollEl.classList.toggle("hand-tool", currentTool === "hand");
    scrollEl.classList.toggle("pan-mode", spaceHeld && currentTool !== "hand");
  }

  function schedulePixelRender() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => {
      drawRaf = null;
      renderPixels();
    });
  }

  function handleDraw(e) {
    const pos = getPixelFromEvent(e, true);
    const color = activeDrawColor();

    if (currentTool === "picker") {
      const exact = getPixelFromEvent(e, false);
      if (!exact) return;
      const picked = pixels[exact.y][exact.x];
      if (picked) setColor(picked, useSecondaryColor ? "secondary" : "primary");
      return;
    }

    if (currentTool === "fill") {
      const exact = getPixelFromEvent(e, false);
      if (!exact || strokeStarted) return;
      strokeStarted = true;
      saveState();
      floodFill(exact.x, exact.y, color);
      render();
      return;
    }

    if (currentTool === "replace") {
      const exact = getPixelFromEvent(e, false);
      if (!exact || strokeStarted) return;
      strokeStarted = true;
      const target = pixels[exact.y][exact.x];
      if (target !== color) replaceAllColor(target, color);
      return;
    }

    if (!strokeStarted) {
      strokeStarted = true;
      saveState();
    }

    if (lastPixel && (lastPixel.x !== pos.x || lastPixel.y !== pos.y)) {
      drawLinePixels(lastPixel.x, lastPixel.y, pos.x, pos.y, color);
    } else {
      paintBrush(pos.x, pos.y, color);
    }

    lastPixel = pos;
    schedulePixelRender();
  }

  function commitShape(end, filled) {
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

  function endStroke() {
    if (drawRaf) {
      cancelAnimationFrame(drawRaf);
      drawRaf = null;
      renderPixels();
    }
    strokeStarted = false;
    isDrawing = false;
    lastPixel = null;
  }

  function endInteraction() {
    if (interactionMode === "pan") endPan();
    if (interactionMode === "shape") {
      clearShapePreview();
      shapeStart = null;
    }
    if (interactionMode === "draw") endStroke();
    activePointerId = null;
    interactionMode = null;
    useSecondaryColor = false;
  }

  function onPointerDown(e) {
    if (activePointerId !== null) return;
    if (e.button > 2) return;

    useSecondaryColor = e.button === 2;
    const onCanvas = isCanvasTarget(e);

    if (shouldPan(e) && (onCanvas || e.target === scrollEl)) {
      activePointerId = e.pointerId;
      interactionMode = "pan";
      startPan(e);
      scrollEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (!onCanvas) return;
    if (currentTool === "hand") return;
    if (e.button !== 0 && e.button !== 2) return;

    if (currentTool === "line" || currentTool === "rect" || currentTool === "circle") {
      const start = getPixelFromEvent(e, false);
      if (!start) return;
      activePointerId = e.pointerId;
      interactionMode = "shape";
      shapeStart = start;
      scrollEl.setPointerCapture(e.pointerId);
      drawShapePreview(shapeStart, start);
      e.preventDefault();
      return;
    }

    activePointerId = e.pointerId;
    interactionMode = "draw";
    isDrawing = true;
    lastPixel = null;
    scrollEl.setPointerCapture(e.pointerId);
    handleDraw(e);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (e.pointerId !== activePointerId) return;

    if (interactionMode === "pan") {
      updatePan(e);
      e.preventDefault();
      return;
    }

    if (interactionMode === "shape" && shapeStart) {
      drawShapePreview(shapeStart, getPixelFromEvent(e, true));
      e.preventDefault();
      return;
    }

    if (interactionMode === "draw" && isDrawing) {
      if (currentTool === "brush" || currentTool === "eraser") {
        handleDraw(e);
      }
      e.preventDefault();
    }
  }

  function onPointerUp(e) {
    if (e.pointerId !== activePointerId) return;

    if (interactionMode === "shape" && shapeStart) {
      const end = getPixelFromEvent(e, true);
      commitShape(end, (currentTool === "rect" || currentTool === "circle") && shiftHeld);
      clearShapePreview();
      shapeStart = null;
    }

    endInteraction();
    if (scrollEl.hasPointerCapture(e.pointerId)) {
      scrollEl.releasePointerCapture(e.pointerId);
    }
  }

  function onPointerCancel(e) {
    if (e.pointerId !== activePointerId) return;
    endInteraction();
  }

  // --- Palette ---

  function renderPalette() {
    paletteEl.innerHTML = "";
    palette.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.className = "palette-swatch";
      swatch.style.background = color;
      swatch.title = color;
      if (color.toLowerCase() === currentColor.toLowerCase()) swatch.classList.add("active");
      swatch.addEventListener("click", () => setColor(color));
      paletteEl.appendChild(swatch);
    });
  }

  function updatePaletteSelection() {
    paletteEl.querySelectorAll(".palette-swatch").forEach((el) => {
      el.classList.toggle("active", el.title.toLowerCase() === currentColor.toLowerCase());
    });
  }

  function selectTool(name) {
    currentTool = name;
    document.querySelectorAll(".tool-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tool === name);
    });
    updateCursorMode();
  }

  // --- Init ---

  drawColorWheel();
  const restored = loadProject();
  if (!restored) {
    createGrid(32);
    setColor("#ff0040");
    secondaryColorEl.style.background = secondaryColor;
    renderPalette();
    renderRecentColors();
  }

  colorWheel.addEventListener("mousedown", (e) => {
    pickFromWheel(e);
    const onMove = (ev) => pickFromWheel(ev);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  brightnessInput.addEventListener("input", () => {
    wheelBright = brightnessInput.value / 100;
    updateColorFromWheel();
  });

  hexInput.addEventListener("change", () => {
    let val = hexInput.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setColor(val);
    else hexInput.value = currentColor;
  });

  document.getElementById("btn-swap-color").addEventListener("click", swapColors);

  secondaryColorEl.addEventListener("click", () => setColor(secondaryColor));
  secondaryColorEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    swapColors();
  });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  });

  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => setBrushSize(parseInt(btn.dataset.size, 10)));
  });

  scrollEl.addEventListener("pointerdown", onPointerDown);
  scrollEl.addEventListener("pointermove", (e) => {
    if (isCanvasTarget(e)) updateCursorPos(e);
    onPointerMove(e);
  });
  scrollEl.addEventListener("pointerleave", () => {
    cursorPosEl.textContent = "—";
  });

  scrollEl.addEventListener("pointerup", onPointerUp);
  scrollEl.addEventListener("pointercancel", onPointerCancel);
  canvasWrap.addEventListener("contextmenu", (e) => e.preventDefault());
  scrollEl.addEventListener("dragstart", (e) => e.preventDefault());

  scrollEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(zoom + (e.deltaY > 0 ? -2 : 2));
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;

    if (e.code === "Space" && !e.repeat) {
      spaceHeld = true;
      updateCursorMode();
      e.preventDefault();
    }
    if (e.key === "Shift") shiftHeld = true;

    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }

    if (e.key === "b" || e.key === "B") selectTool("brush");
    if (e.key === "e" || e.key === "E") selectTool("eraser");
    if (e.key === "l" || e.key === "L") selectTool("line");
    if (e.key === "r" || e.key === "R") selectTool("rect");
    if (e.key === "o" || e.key === "O") selectTool("circle");
    if (e.key === "t" || e.key === "T") selectTool("replace");
    if (e.key === "i" || e.key === "I") selectTool("picker");
    if (e.key === "f" || e.key === "F") selectTool("fill");
    if (e.key === "h" || e.key === "H") selectTool("hand");
    if (e.key === "g" || e.key === "G") {
      showGrid = !showGrid;
      document.getElementById("show-grid").checked = showGrid;
      drawGridOverlay();
    }
    if (e.key === "x" || e.key === "X") swapColors();
    if (e.key === "[") setBrushSize(Math.max(1, brushSize - 1));
    if (e.key === "]") setBrushSize(Math.min(3, brushSize + 1));
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      updateCursorMode();
    }
    if (e.key === "Shift") shiftHeld = false;
  });

  document.getElementById("btn-zoom-in").addEventListener("click", () => setZoom(zoom + 4));
  document.getElementById("btn-zoom-out").addEventListener("click", () => setZoom(zoom - 4));
  document.getElementById("btn-zoom-fit").addEventListener("click", fitZoom);
  document.getElementById("btn-zoom-1x").addEventListener("click", zoomActualSize);
  document.getElementById("btn-new").addEventListener("click", newCanvas);
  document.getElementById("btn-download").addEventListener("click", downloadPNG);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("file-input").addEventListener("change", (e) => {
    if (e.target.files[0]) importImage(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("btn-save-art").addEventListener("click", saveToGallery);

  document.getElementById("btn-new-art").addEventListener("click", () => {
    activeGalleryId = null;
    saveNameInput.value = "";
    saveNameInput.focus();
    renderGallery();
  });

  saveNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveToGallery();
  });

  let eraseConfirmOpen = false;

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (eraseConfirmOpen) return;
    eraseConfirmOpen = true;
    const ok = confirm("Are you sure you want to erase all?");
    eraseConfirmOpen = false;
    if (ok) eraseAllPixels();
  });

  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);

  document.getElementById("btn-add-color").addEventListener("click", () => {
    if (!palette.includes(currentColor)) {
      palette.push(currentColor);
      renderPalette();
      scheduleSave();
    }
  });

  document.getElementById("show-grid").addEventListener("change", (e) => {
    showGrid = e.target.checked;
    drawGridOverlay();
    scheduleSave();
  });

  document.getElementById("mirror-x").addEventListener("change", (e) => {
    mirrorX = e.target.checked;
    scheduleSave();
  });

  document.getElementById("mirror-y").addEventListener("change", (e) => {
    mirrorY = e.target.checked;
    scheduleSave();
  });

  document.getElementById("export-transparent").addEventListener("change", (e) => {
    exportTransparent = e.target.checked;
    scheduleSave();
  });

  document.getElementById("btn-flip-h").addEventListener("click", flipCanvasHorizontal);
  document.getElementById("btn-flip-v").addEventListener("click", flipCanvasVertical);
  document.getElementById("btn-rotate").addEventListener("click", rotateCanvas90);

  document.getElementById("canvas-size").addEventListener("change", (e) => {
    const newSize = parseInt(e.target.value, 10);
    if (newSize === gridSize) return;
    if (!confirm(`Change canvas to ${newSize}×${newSize}? This clears your art.`)) {
      e.target.value = gridSize;
      return;
    }
    activeGalleryId = null;
    saveNameInput.value = "";
    createGrid(newSize);
    fitZoom();
    renderGallery();
  });

  window.addEventListener("resize", fitZoom);
  window.addEventListener("blur", endInteraction);
  updateCursorMode();
  renderGallery();
  fitZoom();
})();
