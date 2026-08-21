import { THEME_STORAGE_KEY } from "../config.js";
import { sanitizeTheme } from "../utils/security.js";

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  const safe = sanitizeTheme(theme);
  document.documentElement.setAttribute("data-theme", safe);
  localStorage.setItem(THEME_STORAGE_KEY, safe);
  updateThemeButton();
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function updateThemeButton() {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  const dark = getTheme() === "dark";
  btn.textContent = dark ? "☀ Light" : "☾ Dark";
  btn.title = dark ? "Switch to light theme" : "Switch to dark theme";
  btn.setAttribute("aria-label", btn.title);
}

export function bindTheme() {
  updateThemeButton();
  document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
}
