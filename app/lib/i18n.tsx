"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICTS, type Lang } from "./i18n.messages";
import { languageToHtmlLang } from "@/app/lib/regional";

type I18nContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  isReady: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("yamada_lang") as Lang | null;
      const validLangs: Lang[] = ["pt", "en", "ja"]; // ✅ Corrigido de 'jp' para 'ja'
      
      if (saved && validLangs.includes(saved)) {
        setLangState(saved);
        document.documentElement.lang = languageToHtmlLang(saved);
      } else {
        document.documentElement.lang = languageToHtmlLang("pt");
      }
    } catch (e) {
      console.warn("[i18n] Falha ao acessar localStorage:", e);
    } finally {
      setIsReady(true);
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);

    if (typeof document !== "undefined") {
      document.documentElement.lang = languageToHtmlLang(l);
    }

    try {
      localStorage.setItem("yamada_lang", l);
    } catch (e) {
      console.warn("[i18n] Falha ao salvar localStorage:", e);
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let translation = DICTS[lang]?.[key] || DICTS.pt?.[key] || key;

      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          // Escapa caracteres especiais de chave com segurança para o motor regex
          const escapedKey = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          translation = translation.replace(new RegExp(`{${escapedKey}}`, "g"), String(v));
        });
      }

      return translation;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t, isReady }), [lang, setLang, t, isReady]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider />");
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t, isReady } = useI18n();

  if (!isReady) return <div className="h-8" />; 

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {(["pt", "en", "ja"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`
            rounded-full border px-3 py-1.5 text-xs font-black transition-all active:scale-95
            ${lang === l 
              ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-sm" 
              : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-800 dark:hover:bg-neutral-800"
            }
          `}
          aria-pressed={lang === l}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}