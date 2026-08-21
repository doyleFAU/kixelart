import { DEFAULT_PALETTE } from "./config.js";

/** @typedef {{ x: number, y: number }} Point */

export const state = {
  gridSize: 32,
  pixels: [],
  currentColor: "#4a8f65",
  secondaryColor: "#8b6914",
  currentTool: "brush",
  brushSize: 1,
  zoom: 16,
  showGrid: true,
  mirrorX: false,
  mirrorY: false,
  exportTransparent: true,
  palette: [...DEFAULT_PALETTE],
  recentColors: [],
  activeGalleryId: null,

  // interaction
  isDrawing: false,
  spaceHeld: false,
  shiftHeld: false,
  lastPixel: null,
  activePointerId: null,
  interactionMode: null,
  panStart: { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 },
  shapeStart: null,
  useSecondaryColor: false,
  strokeStarted: false,
  drawRaf: null,
  eraseConfirmOpen: false,

  // auth (Supabase)
  authUser: null,

  // color wheel
  wheelHue: 0,
  wheelSat: 1,
  wheelBright: 1,

  // history
  history: [],
  historyIndex: -1,
  saveTimeout: null,
};
