import { initElements } from "./elements.js";
import { loadProject } from "./storage/project.js";
import { renderGallery } from "./storage/gallery.js";
import { createGrid } from "./drawing/canvas.js";
import {
  drawColorWheel,
  setColor,
  renderPalette,
  renderRecentColors,
  bindColorWheel,
} from "./color/picker.js";
import { fitZoom, updateCursorMode } from "./renderer.js";
import { bindPointerInput } from "./input/pointer.js";
import { bindKeyboard } from "./input/keyboard.js";
import { bindFileIO } from "./io/files.js";
import { bindUI, restoreGallerySelection } from "./ui/bindings.js";
import { state } from "./state.js";
import { el } from "./elements.js";

function init() {
  initElements();
  drawColorWheel();

  const restored = loadProject();
  if (!restored) {
    createGrid(32);
    setColor("#ff0040");
    el.secondaryColor.style.background = state.secondaryColor;
    renderPalette();
    renderRecentColors();
  } else {
    restoreGallerySelection();
  }

  bindColorWheel();
  bindPointerInput();
  bindKeyboard();
  bindFileIO();
  bindUI();

  updateCursorMode();
  renderGallery();
  fitZoom();
}

init();
