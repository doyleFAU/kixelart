import { THEME_STORAGE_KEY } from "../config.js";

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  localStorage.setItem(THEME_STORAGE_KEY, theme);
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
