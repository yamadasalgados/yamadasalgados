"use client";
import { useCallback, useEffect, useState } from "react";
import type { CustomerSession } from "@/app/hooks/useCustomerSession";

export type CustomerWishlist = {
  ids: Set<string>;
  enabled: boolean;
  loading: boolean;
  busy: string;
  error: string;
  active: boolean;
  blocked: boolean;
  toggle: (id: string) => Promise<void>;
  setAlerts: (value: boolean) => Promise<void>;
};
export default function useCustomerWishlist(sellerId: string, session: CustomerSession): CustomerWishlist {
  const [ids, setIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const active = session.registered && Boolean(session.user);
  const blocked = session.accountRole === "admin" || session.accountRole === "seller";
  useEffect(() => {
    let live = true;
    setIds([]); setEnabled(false); setError("");
    if (!active || !session.user) return () => { live = false; };
    setLoading(true);
    void session.user.getIdToken().then(token => fetch(`/api/customer/wishlist?sellerId=${encodeURIComponent(sellerId)}`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store"
    })).then(async response => { const json = await response.json(); if (!response.ok) throw Error(json.error || "Falha"); return json; })
      .then(data => { if (live) { setIds(data.productIds || []); setEnabled(data.notifyWhenAvailable === true); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : "Falha"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [active, sellerId, session.user]);
  const update = useCallback(async (body: Record<string, unknown>, key: string) => {
    if (!session.user || !session.registered) return;
    setBusy(key); setError("");
    try {
      const token = await session.user.getIdToken();
      const response = await fetch("/api/customer/wishlist", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sellerId, ...body }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Não foi possível salvar.");
      setIds(data.productIds || []); setEnabled(data.notifyWhenAvailable === true);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar favoritos."); }
    finally { setBusy(""); }
  }, [sellerId, session.user, session.registered]);
  return {
    ids: new Set(ids), enabled, loading, busy, error, active, blocked,
    toggle: (id) => update({ productId: id, saved: !ids.includes(id) }, id),
    setAlerts: (value) => update({ notifyWhenAvailable: value }, "alerts"),
  };
}
