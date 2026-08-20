# Kixelart

A free, browser-based pixel art editor. Draw on a grid, pick colors from a wheel, save multiple pieces in **My Art**, and export PNGs — no install required.

**Live demo:** [github.com/doyleFAU/kixelart](https://github.com/doyleFAU/kixelart) (enable GitHub Pages in repo settings to host it online)

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [How to use](#how-to-use)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [My Art gallery](#my-art-gallery)
- [Import & export](#import--export)
- [Project structure](#project-structure)
- [For developers](#for-developers)

---

## Features

### Drawing tools

| Tool | What it does |
|------|----------------|
| **Brush** | Paint pixels. Supports brush sizes 1–3. |
| **Eraser** | Remove pixels (makes them transparent). |
| **Line** | Draw a straight line between two clicks. |
| **Rectangle** | Draw an outline. Hold **Shift** for a filled rectangle. |
| **Circle** | Draw an outline. Hold **Shift** for a filled circle. |
| **Fill** | Flood-fill an area with the current color. |
| **Eyedropper** | Pick a color from the canvas. |
| **Replace** | Click a color to replace every matching pixel on the canvas. |
| **Hand** | Pan around the canvas when zoomed in. |

### Color

- Interactive **color wheel** with brightness slider
- **Hex input** for precise colors
- **Primary** and **secondary** colors (right-click draws with secondary)
- **Recent colors** and a customizable **palette**
- Swap primary ↔ secondary with **X**

### Canvas

- Sizes: **16×16**, **32×32**, **64×64**, **128×128**
- Toggle **grid overlay**
- **Mirror** drawing horizontally and/or vertically while you paint
- **Flip** and **rotate** the whole canvas
- Checkerboard background shows transparent pixels

### Workflow

- **Undo / redo** (50 steps)
- **Auto-save** — your current session is restored when you come back
- **My Art** — name and save up to 40 pieces in the browser
- **Import** images (PNG, JPG, GIF, WebP) onto the current canvas size
- **Export** PNG at 1×–16× scale, with optional transparent background

---

## Quick start

### Option 1: Run locally

Kixelart uses modern JavaScript modules, so you need a simple local server (opening `index.html` directly in the browser will not work).

```bash
cd pixel-art-editor
python3 -m http.server 8765
```

Open **http://localhost:8765** in your browser.

Other servers work too — for example:

```bash
npx serve .
```

### Option 2: GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set source to **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)`.
5. Save. After a minute or two, your site will be live at  
   `https://<your-username>.github.io/kixelart/`

No build step is required — GitHub serves the files as-is.

---

## How to use

### 1. Pick a tool and color

Choose a tool from the left sidebar (or press its letter key — see [shortcuts](#keyboard-shortcuts)).  
Use the color wheel, hex box, palette, or eyedropper to set your color.

### 2. Draw on the canvas

- **Left-click** (or touch) to draw with the primary color.
- **Right-click** to draw with the secondary color.
- **Scroll** on the canvas area to zoom in and out.
- **Space + drag**, **middle-click drag**, or the **Hand** tool to pan when zoomed in.

### 3. Shapes

For **Line**, **Rectangle**, and **Circle**: click once to start, move the mouse, click again to finish.  
Hold **Shift** while drawing rectangles or circles to fill them instead of drawing only the outline.

### 4. Save your work

- **Auto-save:** The editor saves your current session to the browser automatically. You’ll see “Saved” in the bottom toolbar.
- **My Art:** Type a name and click **Save** to store the piece in your gallery (see below).

### 5. Export

Choose an export scale (1×–16×), optionally enable **Transparent PNG export**, then click **Download PNG**.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `B` | Brush |
| `E` | Eraser |
| `L` | Line |
| `R` | Rectangle |
| `O` | Circle |
| `T` | Replace color |
| `F` | Fill bucket |
| `I` | Eyedropper |
| `H` | Hand (pan) |
| `G` | Toggle grid |
| `X` | Swap primary / secondary color |
| `[` / `]` | Decrease / increase brush size |
| `Shift` | Filled rectangle or circle (while drawing) |
| `Space` + drag | Pan canvas |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Y` | Redo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo (alternate) |

---

## My Art gallery

The **My Art** panel lets you keep multiple named pieces in your browser.

1. Enter a name in the text field.
2. Click **Save** to store the current canvas.
3. Click a thumbnail in the list to load that piece.
4. Click **Delete** on a piece to remove it from the gallery.

**Tips:**

- If you load a piece and save again with the same name, it **updates** that entry.
- Use **+ Save as new piece** to clear the name field and save a copy as a new item.
- The gallery holds up to **40** pieces. Older items may be removed when you exceed the limit.
- Gallery data lives in **localStorage** — it stays on this browser and device only. Clearing site data will remove saved art.

---

## Import & export

### Export (Download PNG)

- **Scale:** 1× exports at native pixel size; 4× makes each pixel 4 screen pixels wide (good for sharing pixel art without blur).
- **Transparent PNG export:** When checked, empty pixels export as transparent. When unchecked, the background is white.

Exported filenames look like: `kixelart-32x32-4x-1234567890.png`

### Import

Click **Import** and choose an image. The image is scaled to fit your **current canvas size** (e.g. 32×32). Pixels with low opacity become transparent.

**Note:** Changing canvas size clears the grid and asks for confirmation first.

### Erase All

The red **Erase All** button clears every pixel after a confirmation dialog. This can be undone with **Undo** if you change your mind immediately.

---

## Project structure

The code is split into small files so each part is easy to find and change.

```
pixel-art-editor/
├── index.html          # Page layout and UI markup
├── README.md
├── css/
│   ├── main.css        # Imports all stylesheets below
│   ├── variables.css   # Colors, spacing, theme tokens
│   ├── base.css        # Reset and global styles
│   ├── layout.css      # App layout (header, main, sidebar)
│   ├── components.css  # Buttons, inputs, shared UI
│   ├── sidebar.css     # Tools, palette, gallery panels
│   └── canvas.css      # Canvas area, zoom controls, preview
└── js/
    ├── main.js         # App entry point — runs on page load
    ├── config.js       # Constants, default palette, storage keys
    ├── state.js        # Shared application state
    ├── elements.js     # Cached DOM element references
    ├── history.js      # Undo / redo stack
    ├── renderer.js     # Drawing to canvas, grid, zoom, cursor
    ├── utils/
    │   ├── color.js    # Color conversion helpers
    │   └── pixels.js   # Pixel grid helpers
    ├── drawing/
    │   ├── shapes.js   # Lines, rects, circles, fill
    │   └── canvas.js   # Grid creation, flip, rotate, erase
    ├── color/
    │   └── picker.js   # Color wheel, hex, palette, tools
    ├── storage/
    │   ├── project.js  # Auto-save current session
    │   └── gallery.js  # My Art save / load / delete
    ├── io/
    │   └── files.js    # PNG import and export
    ├── input/
    │   ├── pointer.js  # Mouse, touch, and pen drawing
    │   └── keyboard.js # Keyboard shortcuts
    └── ui/
        └── bindings.js # Button and control event handlers
```

### Where to change common things

| Goal | File(s) to edit |
|------|------------------|
| Add or change a tool | `js/drawing/shapes.js`, `js/input/pointer.js`, `index.html` |
| New keyboard shortcut | `js/input/keyboard.js` |
| Default palette or limits | `js/config.js` |
| Gallery behavior | `js/storage/gallery.js` |
| Visual styling | Matching file under `css/` |
| New sidebar button | `index.html` + `js/ui/bindings.js` |

---

## For developers

### Requirements

- Any modern browser (Chrome, Firefox, Safari, Edge)
- A local HTTP server for development (see [Quick start](#quick-start))
- **No** Node.js, npm, or build step — plain HTML, CSS, and ES modules

### Data storage

| Key | Purpose |
|-----|---------|
| `kixelart-v1` | Current session (canvas, colors, settings) |
| `kixelart-gallery-index` | List of saved gallery item IDs |
| `kixelart-gallery-{id}` | Individual gallery piece data |

Older saves under `pixel-studio-v1` are still loaded for backward compatibility.

### Architecture notes

- **`state.js`** holds the single source of truth (pixels, colors, tool, zoom, etc.).
- **`renderer.js`** turns pixel data into what you see on screen.
- **`history.js`** snapshots pixel grids for undo/redo.
- Drawing uses **pointer capture** and line interpolation so fast strokes don’t leave gaps.

### Contributing

1. Fork or clone the repo.
2. Run a local server and test your changes in the browser.
3. Keep edits focused — match existing file layout and naming.
4. Open a pull request with a short description of what you changed and why.

---

## License

No license file is included yet. If you fork or reuse this project, check with the repository owner about terms of use.

---

Made with **Kixelart** — happy pixel pushing.
