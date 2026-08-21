import { state } from "../state.js";
import { el } from "../elements.js";
import { rgbToHex } from "../utils/color.js";
import { isAllowedImageFile, sanitizeExportScale } from "../utils/security.js";
import { saveState } from "../history.js";
import { render } from "../renderer.js";
import { scheduleSave } from "../storage/project.js";

function isVeryDark(hex) {
  if (!hex) return false;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  return parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16) < 48;
}

function dominantColorInBlock(data, width, x0, y0, x1, y1) {
  const counts = new Map();
  let transparent = 0;
  const total = (x1 - x0) * (y1 - y0);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3];
      if (a === 0) {
        transparent++;
        continue;
      }
      const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
  }

  if (transparent === total) return null;

  let best = null;
  let bestCount = 0;
  for (const [hex, count] of counts) {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

/** Remove thin dark grid lines left in pixel data after downscale. */
function stripThinDarkGridLines(pixels, gridSize) {
  const get = (x, y) => pixels[y]?.[x] ?? null;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = get(x, y);
      if (!isVeryDark(color)) continue;

      const neighbors = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = get(x + dx, y + dy);
        if (n && !isVeryDark(n)) neighbors.push(n);
      }
      if (neighbors.length < 3) continue;

      const counts = new Map();
      for (const n of neighbors) counts.set(n, (counts.get(n) || 0) + 1);
      let best = neighbors[0];
      let bestCount = 0;
      for (const [hex, count] of counts) {
        if (count > bestCount) {
          best = hex;
          bestCount = count;
        }
      }
      pixels[y][x] = best;
    }
  }
}

function pixelsFromImageData(data, srcW, srcH, gridSize) {
  const pixels = [];
  for (let y = 0; y < gridSize; y++) {
    const row = [];
    const y0 = Math.floor(y * srcH / gridSize);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * srcH / gridSize));
    for (let x = 0; x < gridSize; x++) {
      const x0 = Math.floor(x * srcW / gridSize);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * srcW / gridSize));
      row.push(dominantColorInBlock(data, srcW, x0, y0, x1, y1));
    }
    pixels.push(row);
  }
  stripThinDarkGridLines(pixels, gridSize);
  return pixels;
}

export function downloadPNG() {
  const scale = sanitizeExportScale(document.getElementById("export-scale").value);
  const transparent = document.getElementById("export-transparent").checked;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.gridSize * scale;
  exportCanvas.height = state.gridSize * scale;
  const ectx = exportCanvas.getContext("2d");
  ectx.imageSmoothingEnabled = false;

  if (!transparent) {
    ectx.fillStyle = "#ffffff";
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  const temp = document.createElement("canvas");
  temp.width = state.gridSize;
  temp.height = state.gridSize;
  const tctx = temp.getContext("2d");
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      const color = state.pixels[y][x];
      if (color) {
        tctx.fillStyle = color;
        tctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ectx.drawImage(temp, 0, 0, exportCanvas.width, exportCanvas.height);

  const link = document.createElement("a");
  link.download = `kixelart-${state.gridSize}x${state.gridSize}-${scale}x-${Date.now()}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

export function importImage(file) {
  if (!isAllowedImageFile(file)) {
    alert("Please choose a PNG, JPG, GIF, or WebP under 10 MB.");
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => {
    alert("Could not read that file.");
  };
  reader.onload = (ev) => {
    const img = new Image();
    img.onerror = () => {
      alert("That file is not a valid image.");
    };
    img.onload = () => {
      const crop = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - crop) / 2);
      const sy = Math.floor((img.height - crop) / 2);

      const temp = document.createElement("canvas");
      temp.width = crop;
      temp.height = crop;
      const tctx = temp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(img, sx, sy, crop, crop, 0, 0, crop, crop);
      const { data: imageData } = tctx.getImageData(0, 0, crop, crop);

      saveState();
      state.pixels = pixelsFromImageData(
        imageData,
        crop,
        crop,
        state.gridSize
      );
      render();
      scheduleSave();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

export function bindFileIO() {
  document.getElementById("btn-download").addEventListener("click", downloadPNG);
  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("file-input").addEventListener("change", (e) => {
    if (e.target.files[0]) importImage(e.target.files[0]);
    e.target.value = "";
  });
}
