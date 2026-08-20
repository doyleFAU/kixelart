export function clonePixels(data) {
  return data.map((row) => [...row]);
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
