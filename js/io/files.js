import { state } from "../state.js";
import { el } from "../elements.js";
import { rgbToHex, hexToRgb } from "../utils/color.js";
import { isAllowedImageFile, sanitizeExportScale } from "../utils/security.js";
import { saveState } from "../history.js";
import { render } from "../renderer.js";
import { scheduleSave } from "../storage/project.js";

function colorSum(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgb[0] + rgb[1] + rgb[2];
}

function isVeryDark(hex) {
  return colorSum(hex) < 48;
}

function isNearBlack(r, g, b, a) {
  if (a === 0) return false;
  return r + g + b < 36;
}

function dominantColorInBlock(data, width, x0, y0, x1, y1) {
  const counts = new Map();
  let transparent = 0;
  let opaque = 0;
  const total = (x1 - x0) * (y1 - y0);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3];
      if (a === 0) {
        transparent++;
        continue;
      }
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Skip dark compression fringes and grid-line pixels in a block.
      if (a < 250 && isNearBlack(r, g, b, a)) continue;
      opaque++;
      const hex = rgbToHex(r, g, b);
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
  }

  if (opaque === 0) return null;

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;

  let [best, bestCount] = ranked[0];
  if (isVeryDark(best) && ranked.length > 1 && bestCount < opaque * 0.45) {
    const alt = ranked.find(([hex]) => !isVeryDark(hex));
    if (alt) best = alt[0];
  }
  return best;
}

function modeColor(colors) {
  const counts = new Map();
  for (const c of colors) counts.set(c, (counts.get(c) || 0) + 1);
  let best = colors[0];
  let bestCount = 0;
  for (const [hex, count] of counts) {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  }
  return best;
}

/** Remove isolated black/dark specks and thin separator lines after import. */
function cleanupImportArtifacts(pixels, gridSize) {
  const get = (x, y) => (x >= 0 && y >= 0 && x < gridSize && y < gridSize)
    ? pixels[y][x]
    : null;

  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = get(x, y);
        if (!color || !isVeryDark(color)) continue;

        const colorful = [];
        let darkNeighbors = 0;

        for (const [dx, dy] of [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [-1, 1], [1, -1], [-1, -1],
        ]) {
          const n = get(x + dx, y + dy);
          if (!n) continue;
          if (isVeryDark(n)) {
            darkNeighbors++;
          } else {
            colorful.push(n);
          }
        }
        if (!colorful.length) continue;

        // Thin line: dark pixel sandwiched between colors on both axes.
        const left = get(x - 1, y);
        const right = get(x + 1, y);
        const up = get(x, y - 1);
        const down = get(x, y + 1);
        const horizontalLine = left && right && !isVeryDark(left) && !isVeryDark(right);
        const verticalLine = up && down && !isVeryDark(up) && !isVeryDark(down);
        if (horizontalLine || verticalLine) {
          pixels[y][x] = modeColor(colorful);
          continue;
        }

        // Lone speck: mostly surrounded by non-dark pixels.
        if (darkNeighbors <= 1 && colorful.length >= 3) {
          pixels[y][x] = modeColor(colorful);
        }
      }
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
  cleanupImportArtifacts(pixels, gridSize);
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
