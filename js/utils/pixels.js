export function clonePixels(data) {
  return data.map((row) => [...row]);
}

export function countPaintedPixels(pixels) {
  if (!Array.isArray(pixels)) return 0;
  let count = 0;
  for (const row of pixels) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell) count++;
    }
  }
  return count;
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
