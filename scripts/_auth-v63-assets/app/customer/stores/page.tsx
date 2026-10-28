"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import useCustomerSession from "@/app/hooks/useCustomerSession";
import { useI18n } from "@/app/lib/i18n";
import { normalizeCustomerStoreHref, readCustomerStoreContext } from "@/app/lib/customer-store-context";

const COPY = {
  pt: {
    title: "Escolha uma loja",
    info: "Para comprar, abra o link que a loja enviou ou cole o endereço abaixo.",
    label: "Link da loja",
    placeholder: "Cole aqui o link da loja",
    go: "Abrir loja",
    invalid: "Este endereço não é um link de loja válido. Peça o link da loja ao vendedor.",
    recent: "Voltar à última loja visitada",
    account: "Meus pedidos",
  },
  en: {
    title: "Choose a store",
    info: "To shop, open the link shared by the store or paste its address below.",
    label: "Store link",
    placeholder: "Paste the store link here",
    go: "Open store",
    invalid: "This is not a valid store link. Ask the seller for their store link.",
    recent: "Return to last visited store",
    account: "My orders",
  },
  ja: {
    title: "お店を選ぶ",
    info: "お店から届いたリンクを開くか、以下に貼り付けてください。",
    label: "お店のリンク",
    placeholder: "お店のリンクを貼り付けてください",
    go: "お店を開く",
    invalid: "正しいショップリンクではありません。店舗にリンクを確認してください。",
    recent: "最後に訪れたお店に戻る",
    account: "注文履歴",
  },
} as const;

export default function CustomerStoresPage() {
  const { lang } = useI18n();
  const text = COPY[lang === "en" || lang === "ja" ? lang : "pt"];
  const router = useRouter();
  const session = useCustomerSession();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [recent, setRecent] = useState("");

  useEffect(() => {
    setRecent(readCustomerStoreContext(session.user?.uid).sellerId
      ? readCustomerStoreContext(session.user?.uid).storeHref
      : "");
  }, [session.user?.uid]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = normalizeCustomerStoreHref(link);
    if (!path) {
      setError(text.invalid);
      return;
    }
    setError("");
    router.push(path);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <Store size={30} className="mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-black">{text.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{text.info}</p>
        {recent && (
          <Link href={recent} className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-neutral-950">
            {text.recent} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label htmlFor="customer-store-link" className="block text-sm font-bold">{text.label}</label>
          <input id="customer-store-link" type="text" inputMode="url" autoComplete="url" value={link} onChange={(event) => { setLink(event.target.value); setError(""); }} placeholder={text.placeholder} className="min-h-12 w-full min-w-0 rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-base outline-offset-2 dark:border-neutral-700" />
          {error && <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-300">{error}</p>}
          <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black dark:border-neutral-700">{text.go} <ArrowRight size={17} aria-hidden="true" /></button>
        </form>
        <Link href="/customer/orders" className="mt-6 inline-block text-sm font-semibold underline underline-offset-4">{text.account}</Link>
      </section>
    </main>
  );
}
