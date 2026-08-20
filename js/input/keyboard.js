import { state } from "../state.js";
import { undo, redo } from "../history.js";
import { render, drawGridOverlay, updateCursorMode } from "../renderer.js";
import { scheduleSave } from "../storage/project.js";
import { selectTool, setBrushSize, swapColors } from "../color/picker.js";

export function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;

    if (e.code === "Space" && !e.repeat) {
      state.spaceHeld = true;
      updateCursorMode();
      e.preventDefault();
    }
    if (e.key === "Shift") state.shiftHeld = true;

    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) { if (redo()) { render(); scheduleSave(); } }
      else { if (undo()) { render(); scheduleSave(); } }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      if (redo()) { render(); scheduleSave(); }
    }

    const toolKeys = {
      b: "brush", e: "eraser", l: "line", r: "rect", o: "circle",
      t: "replace", i: "picker", f: "fill", h: "hand",
    };
    const key = e.key.toLowerCase();
    if (toolKeys[key]) selectTool(toolKeys[key]);

    if (key === "g") {
      state.showGrid = !state.showGrid;
      document.getElementById("show-grid").checked = state.showGrid;
      drawGridOverlay();
    }
    if (key === "x") swapColors();
    if (e.key === "[") setBrushSize(Math.max(1, state.brushSize - 1));
    if (e.key === "]") setBrushSize(Math.min(3, state.brushSize + 1));
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      state.spaceHeld = false;
      updateCursorMode();
    }
    if (e.key === "Shift") state.shiftHeld = false;
  });
}
