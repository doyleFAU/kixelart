export function getEllipseParams(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  return {
    cx: Math.round((minX + maxX) / 2),
    cy: Math.round((minY + maxY) / 2),
    rx: Math.max(Math.round((maxX - minX) / 2), 1),
    ry: Math.max(Math.round((maxY - minY) / 2), 1),
  };
}

function plotSymmetric(cx, cy, x, y, fn) {
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
    plotSymmetric(cx, cy, x, y, fn);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

export function forEachEllipseOutline(cx, cy, rx, ry, fn) {
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
    plotSymmetric(cx, cy, x, y, fn);
    x++; px += twoRy2;
    if (p < 0) p += ry2 + px;
    else { y--; py -= twoRx2; p += ry2 + px - py; }
  }

  p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2);
  while (y >= 0) {
    plotSymmetric(cx, cy, x, y, fn);
    y--; py -= twoRx2;
    if (p > 0) p += rx2 - py;
    else { x++; px += twoRy2; p += rx2 - py + px; }
  }
}

export function forEachEllipseFilled(cx, cy, rx, ry, fn) {
  const ry2 = ry * ry;
  for (let dy = -ry; dy <= ry; dy++) {
    const y = cy + dy;
    const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ry2)));
    for (let x = cx - dx; x <= cx + dx; x++) fn(x, y);
  }
}

export function forEachLine(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

export function forEachRect(x0, y0, x1, y1, filled, fn) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  if (filled) {
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) fn(x, y);
  } else {
    for (let x = minX; x <= maxX; x++) { fn(x, minY); fn(x, maxY); }
    for (let y = minY; y <= maxY; y++) { fn(minX, y); fn(maxX, y); }
  }
}

export function collectShapePixels(x0, y0, x1, y1, tool, filled, gridSize, mirrorX, mirrorY) {
  const points = new Set();
  const add = (x, y) => {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;
    points.add(`${x},${y}`);
    if (mirrorX) points.add(`${gridSize - 1 - x},${y}`);
    if (mirrorY) points.add(`${x},${gridSize - 1 - y}`);
    if (mirrorX && mirrorY) points.add(`${gridSize - 1 - x},${gridSize - 1 - y}`);
  };

  if (tool === "line") {
    forEachLine(x0, y0, x1, y1, add);
  } else if (tool === "circle") {
    const { cx, cy, rx, ry } = getEllipseParams(x0, y0, x1, y1);
    if (filled) forEachEllipseFilled(cx, cy, rx, ry, add);
    else forEachEllipseOutline(cx, cy, rx, ry, add);
  } else {
    forEachRect(x0, y0, x1, y1, filled, add);
  }
  return points;
}
