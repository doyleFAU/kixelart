import { MAX_HISTORY } from "./config.js";
import { state } from "./state.js";
import { clonePixels } from "./utils/pixels.js";
import { scheduleSave } from "./storage/project.js";

export function resetHistory() {
  state.history = [clonePixels(state.pixels)];
  state.historyIndex = 0;
}

export function saveState() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(clonePixels(state.pixels));
  if (state.history.length > MAX_HISTORY) state.history.shift();
  else state.historyIndex++;
  scheduleSave();
}

export function undo() {
  if (state.historyIndex <= 0) return false;
  state.historyIndex--;
  state.pixels = clonePixels(state.history[state.historyIndex]);
  return true;
}

export function redo() {
  if (state.historyIndex >= state.history.length - 1) return false;
  state.historyIndex++;
  state.pixels = clonePixels(state.history[state.historyIndex]);
  return true;
}
