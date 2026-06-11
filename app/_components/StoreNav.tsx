"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useI18n } from "@/app/lib/i18n";
import { initTheme, onThemeChanged, setTheme, type Theme } from "@/app/lib/theme";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Mapeamento corrigido estritamente para a chave internacional ISO 'ja'
const langFlag: Record<string, string> = {
  pt: "🇧🇷",
  en: "🇺🇸",
  ja: "🇯🇵",
};

type Role = "admin" | "seller" | null;

function IconTheme({ theme, className }: { theme: Theme; className?: string }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21 13.2A7.5 7.5 0 0 1 10.8 3 8.5 8.5 0 1 0 21 13.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-xl text-xs font-black border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
    >
      {children}
    </Link>
  );
}

export default function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useI18n();

  const [langOpen, setLangOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");

  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState<Role>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initial = initTheme();
    setThemeState(initial);
    const offTheme = onThemeChanged((x) => setThemeState(x));

    const offAuth = onAuthStateChanged(auth, async (u) => {
      if (!isMounted) return;
      setLogged(!!u);

      if (!u) {
        setRole(null);
        setLoadingRole(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (isMounted && snap.exists()) {
          const data = snap.data();
          const r: Role = data?.role === "admin" ? "admin" : data?.role === "seller" ? "seller" : null;
          setRole(r);
        } else if (isMounted) {
          setRole(null);
        }
      } catch (e) {
        console.error("[Navbar Engine] Erro ao instanciar privilégios de acesso:", e);
        if (isMounted) setRole(null);
      } finally {
        if (isMounted) setLoadingRole(false);
      }
    });

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangOpen(false);
    };
    window.addEventListener("keydown", onEsc);

    return () => {
      isMounted = false;
      offTheme();
      offAuth();
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  const labels = useMemo(() => {
    const safeTranslate = (key: string, fallback: string) => {
      const value = t(key);
      return value === key ? fallback : value;
    };

    return {
      language: t("navbar.language"),
      theme: safeTranslate("navbar.theme", "Tema"),
      logout: t("common.logout"),
      admin: safeTranslate("navbar.admin", "HOME"),
      sellerPanel: t("dashboard.title"),
    };
  }, [t]);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setThemeState(next);
    setTheme(next);
  }, [theme]);

  const homeHref = useMemo(() => {
    if (!logged) return "/login";
    return role === "admin" ? "/admin" : "/seller";
  }, [logged, role]);

  const isAdminRoute = pathname.startsWith("/admin");
  const isSellerRoute = pathname.startsWith("/seller");

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    router.replace("/login");
  }, [router]);

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 dark:border-neutral-800 bg-white/75 dark:bg-neutral-900/75 backdrop-blur transition-colors">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform">
          <img src="/logo-yamada.png" alt="Yamada" className="h-9 w-9 rounded-xl object-cover shadow-sm" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">Yamada</span>
            <span className="text-[9px] font-black tracking-wider text-neutral-400 uppercase">
              {loadingRole ? "…" : role === "admin" ? "ADMIN" : logged ? "SELLER" : "GUEST"}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {logged && !loadingRole && (
            <>
              <PillLink href={homeHref}>
                {role === "admin" ? labels.admin : labels.sellerPanel}
              </PillLink>

              {role === "admin" && (
                <>
                </>
              )}
            </>
          )}

          {/* Seletor de Idioma */}
          <button
            onClick={() => setLangOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-all"
            title={labels.language}
          >
            {langFlag[lang] || "🌐"}
          </button>

          {/* Toggle Dark/Light Mode */}
          <button
            onClick={toggleTheme}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:scale-95 transition-all"
            title={labels.theme}
          >
            <IconTheme theme={theme} className="h-4 w-4" />
          </button>

          {logged && (
            <button
              onClick={handleLogout}
              className="px-2.5 py-2 text-xs font-black text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
            >
              {labels.logout}
            </button>
          )}
        </div>
      </div>

      {/* MODAL DE SELEÇÃO DE IDIOMA */}
      {langOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setLangOpen(false)}
        >
          <div
            className="w-full max-w-sm mt-12 flex flex-col rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-neutral-100 dark:border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 pb-2">
              <h2 className="text-base font-black text-neutral-900 dark:text-white tracking-tight">{labels.language}</h2>
              <button
                onClick={() => setLangOpen(false)}
                className="text-sm font-black text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-6 pt-2">
              <div className="grid grid-cols-1 gap-1.5">
                {(["pt", "en", "ja"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLang(l);
                      setLangOpen(false);
                    }}
                    className={`flex items-center gap-4 px-4 py-3 rounded-2xl border font-black text-sm transition-all active:scale-[0.99] ${
                      lang === l
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black shadow-md"
                        : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:text-white"
                    }`}
                  >
                    <span className="text-xl">{langFlag[l]}</span>
                    <span className="uppercase text-xs tracking-wider">{l === "ja" ? "Japanese" : l === "en" ? "English" : "Português"}</span>
                  </button>
                ))}
              </div>
            </div>

            {isAdminRoute && role === "admin" && (
              <div className="px-6 pb-6 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                Sessão Restrita: <span className="text-red-500">ADMIN</span>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}