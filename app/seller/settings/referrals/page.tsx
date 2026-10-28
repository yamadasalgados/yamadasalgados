"use client";
import { useEffect, useState } from "react";
import SettingsPageScaffold from "@/app/seller/settings/_components/SettingsPageScaffold";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { useI18n } from "@/app/lib/i18n";
import { copyTextWithFallback, localPreviewUrl, publicStoreOrigin } from "@/app/lib/share-link-client";

const MAX_END_MS = Date.parse("2027-01-01T00:00:00+09:00");
function dateField(ms: number): string { return new Date(ms - 9 * 3600_000).toISOString().slice(0,10); }
function endOfJstDate(date: string): number { return Date.parse(`${date}T00:00:00+09:00`) + 24 * 3600_000; }

export default function ReferralSettingsPage() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const session = useSellerSession();
  const sellerId = session.sellerId;
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState(10);
  const [endDate, setEndDate] = useState("2026-12-31");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [storeLink, setStoreLink] = useState("");
  useEffect(() => {
    if (sellerId && typeof window !== "undefined") {
      setStoreLink(`${publicStoreOrigin()}/store/${encodeURIComponent(sellerId)}`);
    }
  }, [sellerId]);
  async function shareStore() {
    if (!storeLink) return;
    setShareFeedback("");
    try {
      if (navigator.share && !localPreviewUrl(storeLink)) {
        await navigator.share({ title: "Conheça nossa loja", url: storeLink });
      } else {
        const copied = await copyTextWithFallback(storeLink);
        setShareFeedback(copied
          ? language === "pt" ? "Link copiado!" : language === "en" ? "Link copied!" : "リンクをコピーしました"
          : language === "pt" ? "Selecione e copie o endereço abaixo." : language === "en" ? "Select and copy the URL below." : "下のリンクをコピーしてください");
      }
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") setShareFeedback(language === "pt" ? "Selecione e copie o link abaixo." : "Copy the URL below.");
    }
  }
  useEffect(() => {
    if (!sellerId) return;
    let active = true;
    void session.user.getIdToken().then(token => fetch(`/api/seller/referral-campaign?sellerId=${encodeURIComponent(sellerId)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Erro"); return data; })
      .then(data => { if (!active) return; setEnabled(data.enabled); setLimit(data.maxRewardsPerInviter); setEndDate(dateField(data.registrationEndsAtMs)); setLoaded(true); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [sellerId, session.user]);
  async function save() {
    if (!sellerId || saving) return;
    setSaving(true); setMessage("");
    try {
      const token = await session.user.getIdToken();
      const response = await fetch("/api/seller/referral-campaign", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sellerId, enabled, maxRewardsPerInviter: limit, registrationEndsAtMs: Math.min(MAX_END_MS, endOfJstDate(endDate)) }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha ao salvar");
      setMessage(language === "ja" ? "保存しました。" : language === "en" ? "Settings saved." : "Configurações salvas.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erro"); }
    finally { setSaving(false); }
  }
  return <SettingsPageScaffold eyebrow="Fidelidade" title={language === "ja" ? "友達紹介" : language === "en" ? "Referral campaign" : "Campanha de indicação"}
    description={language === "ja" ? "変更は新規紹介にのみ適用されます。" : language === "en" ? "Manage new referral invitations without modifying source code." : "Defina a campanha sem alterar o código do sistema."} backLabel="Configurações">
    <section className="space-y-5 rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={!loaded} />{language === "ja" ? "新規紹介を受け付ける" : language === "en" ? "Accept new referrals" : "Aceitar novas indicações"}</label>
      <label className="block text-sm font-bold">{language === "ja" ? "紹介できる人数（1～1000）" : language === "en" ? "Maximum friends per referrer (1–1000)" : "Máximo de amigos por indicador (1–1000)"}
        <input type="number" min="1" max="1000" value={limit} onChange={e => setLimit(Number(e.target.value))} className="mt-2 block w-full rounded-xl border p-3 text-neutral-950 dark:bg-neutral-800 dark:text-white" /></label>
      <label className="block text-sm font-bold">{language === "ja" ? "新規紹介の最終受付日（日本時間）" : language === "en" ? "Last day for new referrals (Japan time)" : "Último dia para NOVOS convites (horário do Japão)"}
        <input type="date" min="2026-10-27" max="2026-12-31" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-2 block w-full rounded-xl border p-3 text-neutral-950 dark:bg-neutral-800 dark:text-white" /></label>
      <p className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-100">{language === "ja" ? "新規紹介は予告より前に終了する場合があります。登録済みの有効な紹介は2026年12月31日までの初回有料注文・受取で双方100ポイントです。ポイントは同じ店舗のお買い物の割引に使えます。" : language === "en" ? "New invitations may close early. Valid already-linked friends can earn 100 points each after their first paid delivery by Dec 31, 2026. Points are redeemable as discounts at the same store. Each linked friend reserves one slot even if inactive." : "A promoção pode terminar antecipadamente para NOVOS convites. Convites já aceitos continuam elegíveis até 31/12/2026 mediante primeira compra paga e entregue. Cada pessoa recebe 100 pontos (100 pontos = desconto de ¥100, nesta loja). Cada amigo vinculado ocupa uma vaga, mesmo se não comprar."}</p>
      <p className="text-xs text-neutral-500">{language === "ja" ? "他店舗には影響しません。" : language === "en" ? "Only this seller's points wallet and campaign are affected." : "Limite e campanha exclusivos desta loja. Bônus de pontos não são dinheiro e não podem ser sacados."}</p>
      <button type="button" disabled={!loaded || saving || !Number.isInteger(limit) || limit < 1 || limit > 1000 || !endDate} onClick={() => void save()} className="min-h-12 rounded-xl bg-violet-700 px-6 font-black text-white disabled:opacity-50">{saving ? "..." : language === "ja" ? "保存" : language === "en" ? "Save settings" : "Salvar configurações"}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <div className="border-t border-neutral-200 pt-5 dark:border-neutral-700">
        <h3 className="text-base font-black">{language === "pt" ? "Compartilhar minha loja" : language === "en" ? "Share my store" : "ショップを共有"}</h3>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{language === "pt" ? "Você pode divulgar a loja pelo WhatsApp, LINE ou outros aplicativos. Esse link não gera pontos para o vendedor: o bônus de 100 pontos exige o link pessoal de um cliente indicador." : language === "en" ? "Share the store using apps on your phone. Seller store links do not earn referral points; only a customer referral link can qualify for the reward." : "アプリからショップを共有できます。販売者用の店舗リンク自体には紹介ポイントは付与されません。"}</p>
        <button type="button" disabled={!storeLink} onClick={() => void shareStore()} className="mt-3 min-h-12 rounded-xl bg-neutral-950 px-5 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-neutral-950">{language === "pt" ? "Compartilhar loja" : language === "en" ? "Share store" : "ショップを共有"}</button>
        {storeLink && <input value={storeLink} readOnly onFocus={e => e.target.select()} onClick={e => e.currentTarget.select()} aria-label="Link da loja" className="mt-3 w-full rounded-lg border border-neutral-300 bg-transparent p-3 text-xs dark:border-neutral-700" />}
        {storeLink && /^(?:http:\/\/)(?:localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(storeLink) && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{language === "pt" ? "Você está no servidor local do Mac. Amigos fora da mesma rede não conseguirão abrir esse endereço; compartilhe o link do site publicado em HTTPS." : language === "en" ? "This is a local Mac address; friends outside your Wi-Fi need the public HTTPS link." : "ローカルアドレスは同じネットワークでのみ利用できます。公開HTTPSリンクを使用してください。"}</p>
        )}
        {shareFeedback && <p role="status" className="mt-2 text-sm">{shareFeedback}</p>}
      </div>
    </section>
  </SettingsPageScaffold>;
}
