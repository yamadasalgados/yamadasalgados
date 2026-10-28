"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";
import PageHeader from "@/app/_components/PageHeader";

type Campaign = { id: string; title: string; interest: string; status: string; sentCount: number; skippedCount: number; failedCount: number; createdAt: string | null };
type WishDemand = { productId: string; name: string; status: string; waiting: number; optedIn: number };
type Client = { id: string; name: string; purchaseCount: number; interestKeys: string[]; marketingConsent: boolean; lastPurchaseAt: string | null };
export default function SellerCustomersPage() {
  const { lang } = useI18n();
  const language = lang === "ja" || lang === "en" ? lang : "pt";
  const session = useSellerSession();
  const sellerId = session.sellerId;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [customers, setCustomers] = useState<Client[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [wishDemand, setWishDemand] = useState<WishDemand[]>([]);
  const [wishMessage, setWishMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    setBusy(true);
    void session.user.getIdToken().then(token => fetch(`/api/seller/customer-insights?sellerId=${encodeURIComponent(sellerId)}&interest=${encodeURIComponent(filter)}`,
      { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Falha"); return data; })
      .then(data => { if (active) setCustomers(data.customers || []); })
      .catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [filter, sellerId, session.user]);
  async function refreshWishlist() {
    if (!sellerId) return;
    try {
      setWishMessage("");
      const token = await session.user.getIdToken();
      const response = await fetch(`/api/seller/wishlist-demand?sellerId=${encodeURIComponent(sellerId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a lista de espera.");
      setWishDemand(result.products || []);
      if (result.partial) setWishMessage("Lista parcial: mais de 2.000 clientes com favoritos. Consulte a equipe técnica para ampliar o relatório.");
    } catch (error) { setWishMessage(error instanceof Error ? error.message : "Erro ao consultar interessados."); }
  }
  useEffect(() => { if (sellerId) void refreshWishlist(); /* carregamento ao mudar de loja */ }, [sellerId]);
  async function refreshCampaigns() {
    if (!sellerId) return;
    try {
      const token = await session.user.getIdToken();
      const response = await fetch(`/api/seller/marketing-campaigns?sellerId=${encodeURIComponent(sellerId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.ok) setCampaigns(data.campaigns || []);
    } catch { /* keep previous list */ }
  }
  async function send() {
    if (!sellerId || sending || !filter) return;
    if (!window.confirm(language === "en" ? "Send product news only to consenting customers?" : "Enviar novidades somente a clientes que autorizaram?")) return;
    setSending(true); setMessage("");
    try {
      const token = await session.user.getIdToken();
      const response = await fetch("/api/seller/marketing-campaigns", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sellerId, interest: filter, title, body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro");
      void refreshCampaigns();
      setMessage(language === "ja" ? "送信待ちです。Firebase Functionsが必要です。" : language === "en" ? "Queued for delivery. The Firebase Function must be deployed." : "Campanha agendada. A Firebase Function precisa estar publicada para entregar.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro"); }
    finally { setSending(false); }
  }
  const eligible = customers.filter(c => c.marketingConsent).length;
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
    <PageHeader eyebrow="CRM" title={language === "ja" ? "顧客・購入の好み" : language === "en" ? "Customers & purchase interests" : "Clientes e preferências de compra"}
      description={language === "ja" ? "購入履歴に基づいた商品通知。希望者だけに送信します。" : language === "en" ? "Purchase-based customer segments with explicit opt-in messaging." : "Encontre quem já comprou determinado produto e avise sobre novidades somente com autorização do cliente."}
      back={<Link href="/seller/settings" className="text-sm font-bold underline">{language === "ja" ? "設定" : language === "en" ? "Settings" : "Configurações"}</Link>} />
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 font-black">{language === "ja" ? "商品名・カテゴリで検索" : language === "en" ? "Filter by a product or category" : "Filtrar por produto ou categoria"}</h2>
      <form onSubmit={e => { e.preventDefault(); setFilter(query.trim().toLowerCase()); }} className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: feijoada" maxLength={60} className="min-w-0 flex-1 rounded-xl border p-3 text-neutral-950 dark:bg-neutral-800 dark:text-white" />
        <button className="min-h-11 rounded-xl bg-neutral-900 px-5 font-black text-white dark:bg-white dark:text-neutral-950">{language === "en" ? "Filter" : "Buscar"}</button>
      </form>
      <p className="mt-3 text-xs text-neutral-500">{filter ? `Interesse pesquisado: ${filter}` : "Clientes registrados com compra entregue desde a implantação do CRM"}</p>
    </section>
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-black">{language === "ja" ? "顧客一覧" : language === "en" ? "Customers" : "Base de clientes"} — {customers.length} {busy ? "..." : ""}</h2>
      <p className="mt-2 text-xs text-neutral-500">{eligible} {language === "en" ? "with marketing consent" : "com consentimento para novidades"}. Sem telefone/e-mail expostos nesta tela.</p>
      <div className="mt-4 space-y-3">{customers.map(client => <div key={client.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
        <div className="flex items-start justify-between gap-2"><strong className="text-sm">{client.name}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${client.marketingConsent ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}>{client.marketingConsent ? "Aceita novidades" : "Sem autorização"}</span></div>
        <p className="mt-1 text-xs text-neutral-500">{client.purchaseCount} compra(s) entregues · {client.lastPurchaseAt ? new Date(client.lastPurchaseAt).toLocaleDateString() : "—"}</p>
        <p className="mt-2 text-xs text-neutral-500">{client.interestKeys.join(" · ")}</p>
      </div>)}{customers.length === 0 && <p className="text-sm text-neutral-500">{language === "en" ? "No matches." : "Nenhum cliente encontrado neste segmento."}</p>}</div>
    </section>
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{language === "ja" ? "お気に入り・再入荷待ち" : language === "en" ? "Wishlist demand" : "Favoritos e lista de espera"}</h2><p className="mt-1 text-sm text-neutral-500">{language === "en" ? "Aggregate demand, no customer identity exposed." : "Veja o que os clientes desejam comprar, sem expor suas identidades."}</p></div>
        <button type="button" onClick={() => void refreshWishlist()} className="min-h-11 rounded-xl border px-4 text-sm font-bold">{language === "en" ? "Refresh" : "Atualizar"}</button></div>
      <div className="mt-4 space-y-2">{wishDemand.map(item => <div key={item.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm dark:border-neutral-700"><div><strong>{item.name}</strong><p className="text-xs text-neutral-500">{item.status}</p></div><div className="text-right"><strong>{item.waiting} {language === "en" ? "favorites" : "favoritos"}</strong><p className="text-xs text-neutral-500">{item.optedIn} {language === "en" ? "requested restock alerts" : "querem aviso de reposição"}</p></div></div>)}{wishDemand.length === 0 && <p className="text-sm text-neutral-500">{language === "en" ? "No wishlist interest yet." : "Nenhum interesse registrado até agora."}</p>}</div>
      {wishMessage && <p role="status" className="mt-3 text-sm text-orange-700">{wishMessage}</p>}
    </section>
    <section className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900 dark:bg-violet-950/30">
      <h2 className="text-lg font-black">{language === "en" ? "Send product news" : "Avisar clientes interessados"}</h2>
      <p className="text-sm">{language === "en" ? "Select a product filter above. Only customers who opted in and enabled Web Push can receive this message. Max 1 campaign per day." : "Pesquise um produto acima (ex.: feijoada). Só recebem quem já comprou esse tipo de produto, autorizou marketing e ativou Push. Máximo de 1 campanha por dia."}</p>
      <label className="block text-xs font-bold">Título<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="Feijoada disponível amanhã!" className="mt-1 w-full rounded-xl border p-3 text-neutral-950 dark:bg-neutral-800 dark:text-white" /></label>
      <label className="block text-xs font-bold">Mensagem<textarea value={body} maxLength={240} onChange={e => setBody(e.target.value)} placeholder="A feijoada está de volta! Faça sua encomenda na loja." className="mt-1 w-full rounded-xl border p-3 text-neutral-950 dark:bg-neutral-800 dark:text-white" /></label>
      <button type="button" onClick={() => void send()} disabled={!filter || !eligible || sending || title.trim().length < 3 || body.trim().length < 5} className="min-h-12 rounded-xl bg-violet-700 px-6 font-black text-white disabled:opacity-50">{sending ? "..." : language === "en" ? "Send to opted-in customers" : "Enviar aviso aos clientes autorizados"}</button>
    </section>
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">{language === "en" ? "Recent notifications" : "Histórico de campanhas"}</h2>
        <button type="button" onClick={() => void refreshCampaigns()} className="min-h-10 rounded-xl border px-4 text-sm font-bold">{language === "en" ? "Refresh" : "Atualizar status"}</button></div>
      <div className="mt-4 space-y-3">{campaigns.map(c => <div key={c.id} className="rounded-xl border p-3 text-sm dark:border-neutral-700"><p className="font-black">{c.title} · {c.status}</p>
        <p className="text-xs text-neutral-500">{c.interest} · enviados {c.sentCount} · ignorados {c.skippedCount} · falhas {c.failedCount}</p></div>)}
      {campaigns.length === 0 && <p className="text-sm text-neutral-500">{language === "en" ? "Click Refresh to load delivery results." : "Clique em Atualizar status para conferir os envios."}</p>}</div>
    </section>
    {message && <p role="status" className="rounded-xl bg-neutral-100 p-3 text-sm dark:bg-neutral-800">{message}</p>}
  </main>;
}
