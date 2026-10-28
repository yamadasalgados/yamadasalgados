"use client";
import { useEffect, useState } from "react";
import type { CustomerSession } from "@/app/hooks/useCustomerSession";

type Store = { sellerId: string; storeName: string; enabled: boolean };
export default function CustomerMarketingPreferences({ session, language }: { session: CustomerSession; language: "pt" | "en" | "ja" }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!session.user || !session.registered) return;
    let active = true;
    void session.user.getIdToken().then(token => fetch("/api/customer/marketing-preferences", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(r => r.json()).then(payload => { if (active && payload.ok) setStores(payload.stores || []); }).catch(() => {});
    return () => { active = false; };
  }, [session.user, session.registered]);
  async function toggle(store: Store) {
    if (!session.user) return;
    setBusy(store.sellerId); setError("");
    try {
      const token = await session.user.getIdToken();
      const response = await fetch("/api/customer/marketing-preferences", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sellerId: store.sellerId, enabled: !store.enabled }) });
      if (!response.ok) throw new Error("Erro ao salvar preferência");
      setStores(current => current.map(item => item.sellerId === store.sellerId ? { ...item, enabled: !item.enabled } : item));
    } catch(e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(""); }
  }
  const text = language === "ja" ? "気になる商品のお知らせ（任意）" : language === "en" ? "Product news by store (optional)" : "Novidades de produtos por loja (opcional)";
  return <section className="rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
    <h2 className="text-lg font-black">{text}</h2>
    <p className="my-3 text-sm text-neutral-500">{language === "ja" ? "以前購入した商品について、希望する店舗からのみ通知します。いつでも停止できます。端末の通知許可も必要です。" : language === "en" ? "Receive product reminders from selected stores related to purchases. Separate consent from order alerts. Revoke any time. Device push permission is also required." : "Receba avisos de produtos que você já comprou, somente das lojas autorizadas. É separado dos avisos de pedidos e pode ser desativado a qualquer momento. Também é preciso ativar as notificações no aparelho."}</p>
    {stores.length === 0 && <p className="text-sm text-neutral-500">{language === "ja" ? "購入履歴はまだありません。" : language === "en" ? "No previous purchases yet." : "As lojas aparecerão aqui após seus pedidos."}</p>}
    <div className="space-y-3">{stores.map(store => <label key={store.sellerId} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <input type="checkbox" checked={store.enabled} disabled={busy === store.sellerId} onChange={() => void toggle(store)} />
      <span className="min-w-0 text-sm font-bold">{store.storeName || store.sellerId}</span>
    </label>)}</div>{error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
  </section>;
}
