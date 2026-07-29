"use client";

import { useEffect } from "react";

import { PLATFORM_NAME } from "@/app/lib/platform-brand";

function normalizeColor(value: string | undefined): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : "";
}

/**
 * Atualiza o título da aba e a cor do navegador quando uma página possui
 * identidade própria do seller. Ao sair da página, restaura os valores
 * anteriores para não contaminar outras áreas da aplicação.
 */
export function useDocumentBranding({
  title,
  themeColor,
}: {
  title?: string;
  themeColor?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousTitle = document.title;
    const resolvedTitle = String(title ?? "").trim() || PLATFORM_NAME;
    document.title = resolvedTitle;

    const resolvedColor = normalizeColor(themeColor);
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.content ?? "";
    const createdThemeMeta = !themeMeta;

    if (resolvedColor) {
      if (!themeMeta) {
        themeMeta = document.createElement("meta");
        themeMeta.name = "theme-color";
        document.head.appendChild(themeMeta);
      }
      themeMeta.content = resolvedColor;
    }

    return () => {
      document.title = previousTitle || PLATFORM_NAME;
      if (!themeMeta || !resolvedColor) return;
      if (createdThemeMeta) {
        themeMeta.remove();
      } else {
        themeMeta.content = previousThemeColor;
      }
    };
  }, [themeColor, title]);
}
