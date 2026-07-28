"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Gift,
  Globe2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  PackageSearch,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
  Tags,
  UserRound,
  UsersRound,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";

import useCustomerSession from "@/app/hooks/useCustomerSession";
import { auth } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import { initTheme, onThemeChanged, setTheme, type Theme } from "@/app/lib/theme";

const LAST_STORE_KEY = "yamada_customer_last_store_v1";
const LAST_SELLER_KEY = "yamada_customer_last_seller_v1";

const FLAGS = {
  pt: "🇧🇷",
  en: "🇺🇸",
  ja: "🇯🇵",
} as const;

type Language = keyof typeof FLAGS;
type NavKind = "admin" | "seller" | "customer" | "public";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
};

type BaseProps = {
  kind: NavKind;
  displayName?: string;
  sellerId?: string;
  storeHref?: string;
  contextLabel?: string;
};

function isActive(pathname: string, item: NavItem): boolean {
  const hrefPath = item.href.split("?")[0] || item.href;
  if (item.exact) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function NavLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl font-black transition",
        compact
          ? "min-h-12 min-w-0 flex-col gap-0.5 px-1 py-1.5 text-[9px] leading-tight"
          : "px-3 py-2 text-xs",
        active
          ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
      ].join(" ")}
    >
      <span className="relative inline-flex shrink-0">
        <Icon size={compact ? 19 : 16} />
        {(item.badge ?? 0) > 0 && (
          <span
            className={[
              "absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-4 text-white ring-2",
              active
                ? "ring-neutral-950 dark:ring-white"
                : "ring-white dark:ring-neutral-950",
            ].join(" ")}
            aria-label={`${item.badge} novos`}
          >
            {(item.badge ?? 0) > 99 ? "99+" : item.badge}
          </span>
        )}
      </span>
      <span
        className={
          compact
            ? "block w-full min-w-0 truncate text-center"
            : "whitespace-nowrap"
        }
      >
        {item.label}
      </span>
    </Link>
  );
}

function Brand({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3 rounded-xl active:scale-[0.98]">
      <img
        src="/logo-yamada.png"
        alt="Yamada"
        className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm"
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-black text-neutral-950 dark:text-white">Yamada</p>
        <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">
          {label}
        </p>
      </div>
    </Link>
  );
}

function useAppearanceControls() {
  const { lang, setLang } = useI18n();
  const [theme, setThemeState] = useState<Theme>("light");
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    setThemeState(initTheme());
    return onThemeChanged(setThemeState);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setThemeState(next);
    setTheme(next);
  }, [theme]);

  return {
    lang: (lang === "en" || lang === "ja" ? lang : "pt") as Language,
    setLang,
    theme,
    toggleTheme,
    languageOpen,
    setLanguageOpen,
  };
}

export function AppearanceButtons() {
  const {
    lang,
    setLang,
    theme,
    toggleTheme,
    languageOpen,
    setLanguageOpen,
  } = useAppearanceControls();

  return (
    <>
      <button
        type="button"
        onClick={() => setLanguageOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-base transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        aria-label="Language"
      >
        {FLAGS[lang]}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        aria-label="Theme"
      >
        {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {languageOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-sm"
          onClick={() => setLanguageOpen(false)}
        >
          <section
            className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe2 size={20} />
                <h2 className="font-black">Language</h2>
              </div>
              <button
                type="button"
                onClick={() => setLanguageOpen(false)}
                className="rounded-xl p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {(["pt", "en", "ja"] as Language[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => {
                    setLang(language);
                    setLanguageOpen(false);
                  }}
                  className={[
                    "flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-black",
                    lang === language
                      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                      : "border-neutral-200 dark:border-neutral-800",
                  ].join(" ")}
                >
                  <span className="text-xl">{FLAGS[language]}</span>
                  {language === "pt" ? "Português" : language === "en" ? "English" : "日本語"}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function useCopy() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";

  return language === "ja"
    ? {
        admin: "管理者",
        seller: "販売者",
        customer: "お客様",
        store: "ショップ",
        dashboard: "ホーム",
        sellers: "販売者",
        events: "イベント",
        plans: "プラン",
        settings: "設定",
        cleanup: "管理",
        orders: "注文",
        production: "製造",
        products: "商品",
        offers: "オファー",
        reports: "レポート",
        rewards: "ポイント",
        profile: "プロフィール",
        login: "ログイン",
        logout: "ログアウト",
        more: "その他",
        visitStore: "ショップ",
      }
    : language === "en"
      ? {
          admin: "Admin",
          seller: "Seller",
          customer: "Customer",
          store: "Store",
          dashboard: "Dashboard",
          sellers: "Sellers",
          events: "Events",
          plans: "Plans",
          settings: "Settings",
          cleanup: "Tools",
          orders: "Orders",
          production: "Production",
          products: "Products",
          offers: "Offers",
          reports: "Reports",
          rewards: "Rewards",
          profile: "Profile",
          login: "Sign in",
          logout: "Sign out",
          more: "More",
          visitStore: "Store",
        }
      : {
          admin: "Admin",
          seller: "Seller",
          customer: "Cliente",
          store: "Loja",
          dashboard: "Painel",
          sellers: "Vendedores",
          events: "Eventos",
          plans: "Planos",
          settings: "Configurações",
          cleanup: "Ferramentas",
          orders: "Pedidos",
          production: "Produção",
          products: "Produtos",
          offers: "Ofertas",
          reports: "Relatórios",
          rewards: "Pontos",
          profile: "Perfil",
          login: "Entrar",
          logout: "Sair",
          more: "Mais",
          visitStore: "Loja",
        };
}

function DesktopNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label="Primary navigation">
      {items.map((item) => <NavLink key={item.href} item={item} />)}
    </nav>
  );
}

function MobileBottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95 lg:hidden"
      aria-label="Mobile navigation"
    >
      <div
        className="mx-auto grid w-full max-w-xl gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => <NavLink key={item.href} item={item} compact />)}
      </div>
    </nav>
  );
}

function MoreMenu({ items, label }: { items: NavItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative hidden lg:block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {label}<ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          {items.map((item) => (
            <div key={item.href} onClick={() => setOpen(false)}>
              <NavLink item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminNav({ displayName = "" }: { displayName?: string }) {
  const copy = useCopy();
  const router = useRouter();
  const items: NavItem[] = [
    { href: "/admin", label: copy.dashboard, icon: LayoutDashboard, exact: true },
    { href: "/admin/sellers", label: copy.sellers, icon: UsersRound },
    { href: "/admin/events", label: copy.events, icon: CalendarDays },
    { href: "/admin/plans", label: copy.plans, icon: Tags },
    { href: "/admin/settings", label: copy.settings, icon: Settings },
  ];
  const extra: NavItem[] = [{ href: "/admin/cleanup", label: copy.cleanup, icon: Wrench }];

  const logout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand label={displayName || copy.admin} href="/admin" />
          <div className="flex min-w-0 items-center gap-2">
            <DesktopNav items={items} />
            <MoreMenu items={extra} label={copy.more} />
            <AppearanceButtons />
            <button type="button" onClick={() => void logout()} className="inline-flex h-10 items-center justify-center rounded-xl px-2.5 text-xs font-black text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 sm:px-3">
              <LogOut size={16} /><span className="ml-2 hidden sm:inline">{copy.logout}</span>
            </button>
          </div>
        </div>
      </header>
      <MobileBottomNav items={items.slice(0, 5)} />
    </>
  );
}

export function SellerNav({ displayName = "", sellerId = "" }: { displayName?: string; sellerId?: string }) {
  const copy = useCopy();
  const router = useRouter();
  const [orderBadges, setOrderBadges] = useState({ store: 0, event: 0 });

  const refreshOrderBadges = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !sellerId) {
      setOrderBadges({ store: 0, event: 0 });
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(
        `/api/seller/notifications/summary?sellerId=${encodeURIComponent(sellerId)}`,
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; storeUnreadCount?: number; eventUnreadCount?: number }
        | null;
      if (!response.ok || !payload?.ok) return;
      setOrderBadges({
        store: Math.max(0, Math.floor(Number(payload.storeUnreadCount) || 0)),
        event: Math.max(0, Math.floor(Number(payload.eventUnreadCount) || 0)),
      });
    } catch (error) {
      console.warn("[SellerNav] Falha ao atualizar badges:", error);
    }
  }, [sellerId]);

  useEffect(() => {
    void refreshOrderBadges();
    const timer = window.setInterval(() => void refreshOrderBadges(), 30_000);
    const onFocus = () => void refreshOrderBadges();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshOrderBadges();
    };
    const onCustomRefresh = () => void refreshOrderBadges();
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "YAMADA_PUSH_RECEIVED") void refreshOrderBadges();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("yamada:seller-order-badge-refresh", onCustomRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("yamada:seller-order-badge-refresh", onCustomRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [refreshOrderBadges]);

  const mainItems: NavItem[] = [
    { href: "/seller", label: copy.dashboard, icon: LayoutDashboard, exact: true },
    { href: "/seller/store-orders", label: copy.orders, icon: ClipboardList, badge: orderBadges.store },
    { href: "/seller/production", label: copy.production, icon: PackageSearch },
    { href: "/seller/products", label: copy.products, icon: ShoppingBag },
    { href: "/seller/events", label: copy.events, icon: CalendarDays, badge: orderBadges.event },
  ];
  const extra: NavItem[] = [
    { href: "/seller/offers", label: copy.offers, icon: Gift },
    { href: "/seller/reports", label: copy.reports, icon: ChartNoAxesCombined },
    { href: "/seller/settings", label: copy.settings, icon: Settings },
    ...(sellerId ? [{ href: `/store/${encodeURIComponent(sellerId)}`, label: copy.visitStore, icon: Store }] : []),
  ];

  const logout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand label={displayName || copy.seller} href="/seller" />
          <div className="flex min-w-0 items-center gap-2">
            <DesktopNav items={mainItems} />
            <MoreMenu items={extra} label={copy.more} />
            <AppearanceButtons />
            <button type="button" onClick={() => void logout()} className="inline-flex h-10 items-center justify-center rounded-xl px-2.5 text-xs font-black text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 sm:px-3">
              <LogOut size={16} /><span className="ml-2 hidden sm:inline">{copy.logout}</span>
            </button>
          </div>
        </div>
      </header>
      <MobileBottomNav items={mainItems.slice(0, 4).concat([{ href: "/seller/settings", label: copy.more, icon: Settings }])} />
    </>
  );
}

function readCustomerContext() {
  if (typeof window === "undefined") return { storeHref: "/", sellerId: "" };
  return {
    storeHref: window.localStorage.getItem(LAST_STORE_KEY) || "/",
    sellerId: window.localStorage.getItem(LAST_SELLER_KEY) || "",
  };
}

export function CustomerNav() {
  const copy = useCopy();
  const pathname = usePathname();
  const session = useCustomerSession();
  const [context, setContext] = useState(() => ({ storeHref: "/", sellerId: "" }));

  useEffect(() => {
    setContext(readCustomerContext());
  }, [pathname]);

  const rewardsHref = context.sellerId
    ? `/customer/rewards?sellerId=${encodeURIComponent(context.sellerId)}&next=${encodeURIComponent(context.storeHref)}`
    : "/customer/rewards";
  const items: NavItem[] = [
    { href: context.storeHref, label: copy.store, icon: Store, exact: context.storeHref === "/" },
    { href: "/customer/orders", label: copy.orders, icon: ShoppingBag },
    { href: rewardsHref, label: copy.rewards, icon: Sparkles },
    { href: `/customer/profile?next=${encodeURIComponent(context.storeHref)}`, label: copy.profile, icon: UserRound },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand label={session.displayName || copy.customer} href={context.storeHref} />
          <div className="flex items-center gap-2">
            {session.registered && <DesktopNav items={items} />}
            <AppearanceButtons />
            {session.registered ? (
              <button type="button" onClick={() => void session.signOutCustomer()} className="inline-flex h-10 items-center justify-center rounded-xl px-2.5 text-xs font-black text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 sm:px-3">
                <LogOut size={16} /><span className="ml-2 hidden sm:inline">{copy.logout}</span>
              </button>
            ) : pathname.startsWith("/customer/login") ? null : (
              <Link href={`/customer/login?next=${encodeURIComponent(pathname || "/customer/orders")}`} className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white dark:bg-white dark:text-neutral-950">
                <LogIn size={16} />{copy.login}
              </Link>
            )}
          </div>
        </div>
      </header>
      {session.registered && <MobileBottomNav items={items} />}
    </>
  );
}

export function PublicStoreNav({ sellerId, storeHref, contextLabel = "" }: BaseProps) {
  const copy = useCopy();
  const pathname = usePathname();
  const session = useCustomerSession();
  const resolvedStoreHref = storeHref || (sellerId ? `/store/${encodeURIComponent(sellerId)}` : "/");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (resolvedStoreHref) window.localStorage.setItem(LAST_STORE_KEY, resolvedStoreHref);
    if (sellerId) window.localStorage.setItem(LAST_SELLER_KEY, sellerId);
  }, [resolvedStoreHref, sellerId]);

  const rewardsHref = sellerId
    ? `/customer/rewards?sellerId=${encodeURIComponent(sellerId)}&next=${encodeURIComponent(pathname || resolvedStoreHref)}`
    : "/customer/rewards";
  const items: NavItem[] = [
    { href: resolvedStoreHref, label: copy.store, icon: Store, exact: true },
    { href: "/customer/orders", label: copy.orders, icon: ShoppingBag },
    { href: rewardsHref, label: copy.rewards, icon: Sparkles },
    { href: `/customer/profile?next=${encodeURIComponent(pathname || resolvedStoreHref)}`, label: copy.profile, icon: UserRound },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand label={contextLabel || copy.store} href={resolvedStoreHref} />
          <div className="flex items-center gap-2">
            {session.registered && <DesktopNav items={items} />}
            <AppearanceButtons />
            {session.registered ? (
              <button type="button" onClick={() => void session.signOutCustomer()} className="inline-flex h-10 items-center justify-center rounded-xl px-2.5 text-xs font-black text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 sm:px-3">
                <LogOut size={16} /><span className="ml-2 hidden sm:inline">{copy.logout}</span>
              </button>
            ) : (
              <Link href={`/customer/login?next=${encodeURIComponent(pathname || resolvedStoreHref)}`} className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white dark:bg-white dark:text-neutral-950">
                <LogIn size={16} />{copy.login}
              </Link>
            )}
          </div>
        </div>
      </header>
      {session.registered && <MobileBottomNav items={items} />}
    </>
  );
}
