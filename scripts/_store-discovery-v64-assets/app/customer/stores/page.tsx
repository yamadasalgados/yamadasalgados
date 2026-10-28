"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, Search, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import useCustomerSession from "@/app/hooks/useCustomerSession";
import { useI18n } from "@/app/lib/i18n";
import {
  normalizeCustomerStoreHref,
  readCustomerStoreContext,
  rememberCustomerStoreContext,
} from "@/app/lib/customer-store-context";

type FoundStore = {
  sellerId: string;
  storeName: string;
  regionName: string;
  logoUrl: string;
};

const COPY = {
  pt: {
    title: "Encontre uma loja",
    info: "Digite o nome da loja que você procura ou abra o link enviado pelo vendedor.",
    search: "Nome da loja",
    searchPlaceholder: "Ex.: Yamada Salgados",
    searching: "Procurando lojas...",
    searchHint: "Digite pelo menos duas letras para pesquisar.",
    noResults: "Não encontramos essa loja. Confira o nome ou peça o link ao vendedor.",
    searchError: "Não foi possível pesquisar agora. Tente novamente.",
    partial: "A busca está limitada às primeiras lojas cadastradas. Se não encontrar, use o link da loja.",
    go: "Abrir loja",
    recent: "Voltar à última loja visitada",
    linkOption: "Tenho o link da loja",
    label: "Link da loja",
    placeholder: "Cole o link enviado pelo vendedor",
    invalid: "Este endereço não é um link de loja válido.",
    account: "Meus pedidos",
    points: "Os pontos são exclusivos de cada loja. Os pontos de uma loja não podem pagar pedidos de outra.",
  },
  en: {
    title: "Find a store",
    info: "Search by store name or open the link sent by the seller.",
    search: "Store name",
    searchPlaceholder: "E.g. Yamada Salgados",
    searching: "Searching for stores...",
    searchHint: "Enter at least two letters to search.",
    noResults: "Store not found. Check the spelling or ask the seller for a link.",
    searchError: "Search is temporarily unavailable. Please try again.",
    partial: "Search currently covers the first registered stores. Use a store link if necessary.",
    go: "Open store",
    recent: "Return to last visited store",
    linkOption: "I have a store link",
    label: "Store link",
    placeholder: "Paste the link sent by the store",
    invalid: "This is not a valid store link.",
    account: "My orders",
    points: "Points belong to each store. Points from one store cannot pay for orders at another.",
  },
  ja: {
    title: "お店を探す",
    info: "店名で検索するか、お店から届いたリンクを開いてください。",
    search: "店名",
    searchPlaceholder: "例：Yamada Salgados",
    searching: "お店を検索中...",
    searchHint: "2文字以上入力してください。",
    noResults: "お店が見つかりません。店名を確認するか、リンクをお店にお問い合わせください。",
    searchError: "検索できませんでした。もう一度お試しください。",
    partial: "検索対象に上限があります。見つからない場合は店舗リンクをご利用ください。",
    go: "お店を開く",
    recent: "前に訪れたお店へ",
    linkOption: "店舗リンクを持っています",
    label: "店舗リンク",
    placeholder: "店舗のリンクを貼り付けてください",
    invalid: "正しい店舗リンクではありません。",
    account: "注文履歴",
    points: "ポイントは店舗ごとに管理されます。他店のお支払いには使えません。",
  },
} as const;

export default function CustomerStoresPage() {
  const { lang } = useI18n();
  const text = COPY[lang === "en" || lang === "ja" ? lang : "pt"];
  const router = useRouter();
  const session = useCustomerSession();
  const [query, setQuery] = useState("");
  const [stores, setStores] = useState<FoundStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [limited, setLimited] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [recent, setRecent] = useState("");

  useEffect(() => {
    const saved = readCustomerStoreContext(session.user?.uid);
    setRecent(saved.sellerId ? saved.storeHref : "");
  }, [session.user?.uid]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) {
      setStores([]);
      setLoading(false);
      setHasSearched(false);
      setSearchError("");
      setLimited(false);
      return;
    }

    setStores([]);
    setLoading(true);
    setHasSearched(false);
    setSearchError("");
    setLimited(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/public/stores/search?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json() as {
          ok?: boolean;
          stores?: FoundStore[];
          limited?: boolean;
        };
        if (!response.ok || data.ok !== true || !Array.isArray(data.stores)) {
          throw new Error("SEARCH_UNAVAILABLE");
        }
        setStores(data.stores);
        setLimited(data.limited === true);
        setHasSearched(true);
      } catch (error) {
        if (!controller.signal.aborted) {
          setStores([]);
          setSearchError(text.searchError);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, text.searchError]);

  function selectStore(sellerId: string) {
    rememberCustomerStoreContext(session.user?.uid, `/store/${sellerId}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = normalizeCustomerStoreHref(link);
    if (!path) {
      setLinkError(text.invalid);
      return;
    }
    setLinkError("");
    rememberCustomerStoreContext(session.user?.uid, path);
    router.push(path);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24 sm:px-6 sm:py-10">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <Store size={30} className="mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-black">{text.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{text.info}</p>

        {recent && (
          <Link href={recent} className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-black dark:border-neutral-700">
            {text.recent} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}

        <div className="mt-6">
          <label htmlFor="customer-store-search" className="block text-sm font-bold">{text.search}</label>
          <div className="relative mt-2">
            <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <input
              id="customer-store-search"
              type="search"
              value={query}
              maxLength={70}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchPlaceholder}
              className="min-h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-transparent py-3 pl-11 pr-4 text-base outline-offset-2 dark:border-neutral-700"
            />
          </div>
          <div aria-live="polite" aria-atomic="true" className="mt-3 space-y-2">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={17} className="animate-spin" />{text.searching}</p>
            ) : searchError ? (
              <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-300">{searchError}</p>
            ) : hasSearched && stores.length === 0 ? (
              <p className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{text.noResults}</p>
            ) : query.trim().length < 2 ? (
              <p className="text-sm text-neutral-500">{text.searchHint}</p>
            ) : null}
            {!loading && !searchError && stores.map((store) => (
              <Link
                key={store.sellerId}
                href={`/store/${store.sellerId}`}
                onClick={() => selectStore(store.sellerId)}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-neutral-200 p-3 transition hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline-offset-2 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-neutral-100 dark:bg-neutral-800"><Store size={22} aria-hidden="true" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{store.storeName}</span>
                  {store.regionName && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{store.regionName}</span>}
                </span>
                <ArrowRight size={20} className="shrink-0" aria-label={text.go} />
              </Link>
            ))}
            {hasSearched && limited && <p className="text-xs text-neutral-500">{text.partial}</p>}
          </div>
        </div>

        <details className="mt-6 border-t border-neutral-200 pt-5 dark:border-neutral-700">
          <summary className="cursor-pointer text-sm font-bold underline-offset-4 hover:underline">{text.linkOption}</summary>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label htmlFor="customer-store-link" className="block text-sm font-bold">{text.label}</label>
            <input id="customer-store-link" type="text" inputMode="url" autoComplete="url" value={link} onChange={(event) => { setLink(event.target.value); setLinkError(""); }} placeholder={text.placeholder} className="min-h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-base outline-offset-2 dark:border-neutral-700" />
            {linkError && <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-300">{linkError}</p>}
            <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black dark:border-neutral-700">{text.go} <ArrowRight size={17} aria-hidden="true" /></button>
          </form>
        </details>

        <p className="mt-6 rounded-xl bg-neutral-100 px-4 py-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{text.points}</p>
        <Link href="/customer/orders" className="mt-5 inline-block text-sm font-semibold underline underline-offset-4">{text.account}</Link>
      </section>
    </main>
  );
}
