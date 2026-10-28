export type Theme = "dark" | "light";

const KEY = "order_system_theme_v1";
const LEGACY_KEY = "yamada_theme_v1";

function storedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(KEY);
  if (current === "dark" || current === "light") return current;

  // Migração silenciosa da preferência usada antes da neutralização da plataforma.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === "dark" || legacy === "light") {
    try { localStorage.setItem(KEY, legacy); } catch {}
    return legacy;
  }
  return null;
}

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return storedTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent("theme:changed", { detail: theme }));
}

export function onThemeChanged(cb: (theme: Theme) => void) {
  if (typeof window === "undefined") return () => {};
  const handleCustomEvent = (e: Event) => cb((e as CustomEvent<Theme>).detail || getTheme());
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === KEY || e.key === LEGACY_KEY) cb(getTheme());
  };
  window.addEventListener("theme:changed", handleCustomEvent as EventListener);
  window.addEventListener("storage", handleStorageEvent);
  return () => {
    window.removeEventListener("theme:changed", handleCustomEvent as EventListener);
    window.removeEventListener("storage", handleStorageEvent);
  };
}

export function initTheme(): Theme {
  const theme = getTheme();
  applyTheme(theme);
  return theme;
}
