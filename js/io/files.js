import { state } from "../state.js";
import { el } from "../elements.js";
import { rgbToHex } from "../utils/color.js";
import { isAllowedImageFile, sanitizeExportScale } from "../utils/security.js";
import { saveState } from "../history.js";
import { render } from "../renderer.js";
import { scheduleSave } from "../storage/project.js";

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
      const temp = document.createElement("canvas");
      temp.width = state.gridSize;
      temp.height = state.gridSize;
      const tctx = temp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      const crop = Math.min(img.width, img.height);
      const sx = (img.width - crop) / 2;
      const sy = (img.height - crop) / 2;
      tctx.drawImage(
        img,
        sx, sy, crop, crop,
        0, 0, state.gridSize, state.gridSize
      );
      const imageData = tctx.getImageData(0, 0, state.gridSize, state.gridSize).data;

      saveState();
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          const i = (y * state.gridSize + x) * 4;
          const a = imageData[i + 3];
          state.pixels[y][x] = a === 0
            ? null
            : rgbToHex(imageData[i], imageData[i + 1], imageData[i + 2]);
        }
      }
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
