export type Theme = "dark" | "light";

const KEY = "yamada_theme_v1";

/**
 * Lê o tema atual persistido ou avalia a preferência nativa do sistema operacional.
 */
export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Modifica as classes do DOM de forma imperativa para aplicar o design correto na tela.
 */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  
  // Alinha perfeitamente os atributos com o script anti-flash do layout.tsx
  root.dataset.theme = theme;

  if (theme === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

/**
 * Persiste o novo tema escolhido e propaga o estado para os ouvintes reativos da sessão.
 */
export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
  
  // Dispara o evento interno customizado para os hooks reativos do React atualizarem os estados
  window.dispatchEvent(new CustomEvent("theme:changed", { detail: theme }));
}

/**
 * Registra listeners reativos para sincronizar o tema entre abas, janelas e componentes.
 */
export function onThemeChanged(cb: (theme: Theme) => void) {
  if (typeof window === "undefined") return () => {};

  const handleCustomEvent = (e: Event) => {
    const customEvent = e as CustomEvent<Theme>;
    const newTheme = customEvent.detail || getTheme();
    cb(newTheme);
  };

  const handleStorageEvent = (e: StorageEvent) => {
    // Escuta apenas se a mudança no localStorage veio de outra aba e foi especificamente no tema
    if (e.key === KEY) {
      const newTheme = (e.newValue as Theme) || getTheme();
      cb(newTheme);
    }
  };

  window.addEventListener("theme:changed", handleCustomEvent as EventListener);
  window.addEventListener("storage", handleStorageEvent);
  
  return () => {
    window.removeEventListener("theme:changed", handleCustomEvent as EventListener);
    window.removeEventListener("storage", handleStorageEvent);
  };
}

/**
 * Inicializa, aplica o tema mapeado de forma imperativa e retorna o estado estável.
 */
export function initTheme(): Theme {
  const t = getTheme();
  applyTheme(t);
  return t;
}