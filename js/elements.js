/** Cache of DOM references used across the app. */
export const el = {
  canvas: null,
  ctx: null,
  scroll: null,
  canvasWrap: null,
  checkerboard: null,
  gridOverlay: null,
  gridCtx: null,
  previewOverlay: null,
  previewOverlayCtx: null,
  previewCanvas: null,
  previewCtx: null,
  colorWheel: null,
  wheelCtx: null,
  wheelCursor: null,
  brightness: null,
  currentColor: null,
  secondaryColor: null,
  hexInput: null,
  palette: null,
  recentColors: null,
  zoomLabel: null,
  saveStatus: null,
  galleryList: null,
  saveName: null,
  cursorPos: null,
  galleryStatus: null,
};

export function initElements() {
  el.canvas = document.getElementById("pixel-canvas");
  el.ctx = el.canvas.getContext("2d");
  el.scroll = document.getElementById("canvas-scroll");
  el.canvasWrap = document.getElementById("canvas-wrap");
  el.checkerboard = document.getElementById("checkerboard");
  el.gridOverlay = document.getElementById("grid-overlay");
  el.gridCtx = el.gridOverlay.getContext("2d");
  el.previewOverlay = document.getElementById("preview-overlay");
  el.previewOverlayCtx = el.previewOverlay.getContext("2d");
  el.previewCanvas = document.getElementById("preview-canvas");
  el.previewCtx = el.previewCanvas.getContext("2d");
  el.colorWheel = document.getElementById("color-wheel");
  el.wheelCtx = el.colorWheel.getContext("2d");
  el.wheelCursor = document.getElementById("wheel-cursor");
  el.brightness = document.getElementById("brightness");
  el.currentColor = document.getElementById("current-color");
  el.secondaryColor = document.getElementById("secondary-color");
  el.hexInput = document.getElementById("hex-input");
  el.palette = document.getElementById("palette");
  el.recentColors = document.getElementById("recent-colors");
  el.zoomLabel = document.getElementById("zoom-label");
  el.saveStatus = document.getElementById("save-status");
  el.galleryList = document.getElementById("gallery-list");
  el.saveName = document.getElementById("save-name");
  el.cursorPos = document.getElementById("cursor-pos");
  el.galleryStatus = document.getElementById("gallery-status");
}

export function $(id) {
  return document.getElementById(id);
}
