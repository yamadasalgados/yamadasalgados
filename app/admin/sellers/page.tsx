"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  where,
  documentId,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";
import { deleteSellerFromAdmin } from "@/app/lib/deleteSeller";
import { useI18n } from "@/app/lib/i18n";

type PlanId = "starter" | "pro" | "business";
type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";

type UserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  role: "admin" | "seller";
  active: boolean;
  suspended: boolean;
  sellerId: string;
  regionId: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function badgeTone(role?: string) {
  if (role === "admin") return "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400";
  return "bg-neutral-500/10 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300";
}

export default function AdminSellersPage() {
  return <AdminGuard>{() => <AdminSellersInner />}</AdminGuard>;
}

function AdminSellersInner() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [qText, setQText] = useState("");
  const [onlySellers, setOnlySellers] = useState(true);
  const [busyMap, setBusyMap] = useState<Record<string, "toggle" | "delete" | "">>({});

  const setBusy = useCallback((uid: string, v: "toggle" | "delete" | "") => {
    setBusyMap((prev) => ({ ...prev, [uid]: v }));
  }, []);

  const yen = useCallback(
    (n: number) => {
      const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "ja-JP";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
      }).format(Math.round(n || 0));
    },
    [lang]
  );

  const statusTone = useCallback((active: boolean, suspended: boolean) => {
    if (suspended) {
      return { 
        label: lang === "ja" ? "アカウント停止中" : lang === "en" ? "Suspended" : "Suspenso", 
        cls: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" 
      };
    }
    if (!active) {
      return { 
        label: lang === "ja" ? "無効" : lang === "en" ? "Inactive" : "Inativo", 
        cls: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" 
      };
    }
    return { 
      label: lang === "ja" ? "有効" : lang === "en" ? "Active" : "Ativo", 
      cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" 
    };
  }, [lang]);

  const load = useCallback(async () => {
    setErrMsg("");
    setLoading(true);

    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(300)));
      } catch {
        snap = await getDocs(query(collection(db, "users"), limit(300)));
        setErrMsg(lang === "ja" ? "警告：一部のユーザーに作成日時がありません。" : lang === "en" ? "Warning: some users lack a creation timestamp." : "Aviso: alguns usuários não têm data de criação.");
      }

      const baseList = snap.docs.map((d) => normalizeUserRow(d.id, d.data() as any));
      const merged = await mergeSellerData(baseList);
      setRows(merged);
    } catch {
      setErrMsg(lang === "ja" ? "データの読み込みに失敗しました。" : lang === "en" ? "Failed to load users." : "Falha ao carregar usuários.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = qText.trim().toLowerCase();
    let base = rows;

    if (onlySellers) base = base.filter((r) => r.role === "seller");

    if (term) {
      base = base.filter((r) => {
        const hay = `${norm(r.email)} ${norm(r.displayName)} ${norm(r.id)} ${norm(r.sellerId)} ${norm(
          r.regionId
        )} ${norm(r.plan)} ${norm(r.subscriptionStatus)}`.toLowerCase();
        return hay.includes(term);
      });
    }

    return [...base].sort((a, b) => {
      const aAdmin = a.role === "admin";
      const bAdmin = b.role === "admin";
      if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;

      const an = (a.displayName || a.email || a.id).toLowerCase();
      const bn = (b.displayName || b.email || b.id).toLowerCase();
      return an.localeCompare(bn, "pt-BR");
    });
  }, [rows, qText, onlySellers]);

  async function updateSuspension(userId: string, suspended: boolean) {
    setErrMsg("");
    setBusy(userId, "toggle");
    try {
      await updateDoc(doc(db, "users", userId), { suspended, updatedAt: serverTimestamp() });
      try { await updateDoc(doc(db, "sellers", userId), { suspended, updatedAt: serverTimestamp() }); } catch {}
      setRows((prev) => prev.map((x) => (x.id === userId ? { ...x, suspended } : x)));
    } catch {
      setErrMsg(lang === "ja" ? "ステータスの更新に失敗しました。" : lang === "en" ? "Failed to update suspension status." : "Falha ao atualizar suspensão.");
    } finally {
      setBusy(userId, "");
    }
  }

  async function updateActivation(userId: string, active: boolean) {
    setErrMsg("");
    setBusy(userId, "toggle");
    try {
      await updateDoc(doc(db, "users", userId), { active, updatedAt: serverTimestamp() });
      try { await updateDoc(doc(db, "sellers", userId), { active, updatedAt: serverTimestamp() }); } catch {}
      setRows((prev) => prev.map((x) => (x.id === userId ? { ...x, active } : x)));
    } catch {
      setErrMsg(lang === "ja" ? "アクティベーション状態の更新に失敗しました。" : lang === "en" ? "Failed to update activation status." : "Falha ao atualizar ativo/inativo.");
    } finally {
      setBusy(userId, "");
    }
  }

  async function updateRole(userId: string, role: "admin" | "seller") {
    setErrMsg("");
    setBusy(userId, "toggle");
    try {
      await updateDoc(doc(db, "users", userId), { role, updatedAt: serverTimestamp() });
      setRows((prev) => prev.map((x) => (x.id === userId ? { ...x, role } : x)));
    } catch {
      setErrMsg(lang === "ja" ? "権限の更新に失敗しました。" : lang === "en" ? "Failed to update role." : "Falha ao atualizar role.");
    } finally {
      setBusy(userId, "");
    }
  }

  async function hardDeleteSeller(userId: string) {
    setErrMsg("");
    setBusy(userId, "delete");
    try {
      const msgConfirm = lang === "ja" 
        ? "⚠️ 注意！\n\nこの操作は販売者とすべての関連データ（製品、イベント、注文、メッセージ）を完全に削除します。よろしいですか？"
        : lang === "en"
        ? "⚠️ WARNING!\n\nThis will permanently delete this seller and ALL associated data (products, events, orders, messages). Continue?"
        : "⚠️ ATENÇÃO!\n\nIsso vai APAGAR DEFINITIVAMENTE o seller e TODOS os dados dele (produtos, eventos, pedidos, mensagens). Deseja continuar?";
      
      if (!confirm(msgConfirm)) return;

      await deleteSellerFromAdmin(userId);
      setRows((prev) => prev.filter((x) => x.id !== userId));
    } catch {
      setErrMsg(lang === "ja" ? "削除に失敗しました。" : lang === "en" ? "Failed to delete seller." : "Falha ao apagar seller.");
    } finally {
      setBusy(userId, "");
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto p-2 sm:p-0">
      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-5 space-y-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">Sellers & Users</h2>
            <p className="text-xs font-medium text-neutral-400">{lang === "ja" ? "ユーザーの検索、ステータスの変更、および完全削除を行います。" : lang === "en" ? "Search and manage user properties, roles, suspensions, and hard deletion." : "Buscar e gerenciar usuários. Controlar suspensão, ativação, role e exclusão definitiva."}</p>
          </div>

          <button onClick={load} className="rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black px-4 py-2.5 shadow-sm uppercase tracking-wider self-start sm:self-center transition">
            {t("common.reload") || "Sync"}
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={lang === "ja" ? "メール、名前、UID、地域ID、プランで検索..." : lang === "en" ? "Search by email, name, uid, regionId, plan..." : "Buscar por email, nome, uid, regionId, plan..."}
            className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
          />

          <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-500 cursor-pointer whitespace-nowrap self-start md:self-center">
            <input type="checkbox" checked={onlySellers} onChange={(e) => setOnlySellers(e.target.checked)} className="accent-black dark:accent-white h-4 w-4 rounded" />
            <span>{lang === "ja" ? "販売者のみ表示" : lang === "en" ? "Show sellers only" : "Mostrar apenas sellers"}</span>
          </label>
        </div>
      </section>

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {errMsg}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 bg-neutral-100 dark:bg-neutral-900 rounded-[2rem] border border-neutral-200 dark:border-neutral-800" />
      ) : (
        <section className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 rounded-[2rem] p-4 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-100 dark:border-neutral-800/60">
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Tier</th>
                  <th className="py-3 px-3">IDs</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/40 font-medium">
                {filtered.map((r) => {
                  const status = statusTone(r.active, r.suspended);
                  const busy = busyMap[r.id] || "";
                  const isBusy = busy === "toggle";
                  const isDeleting = busy === "delete";

                  return (
                    <tr key={r.id} className="hover:bg-neutral-50/40 dark:hover:bg-neutral-900/20 transition">
                      <td className="py-3.5 px-3">
                        <div className="font-black text-neutral-900 dark:text-white text-sm tracking-tight">{r.displayName || "—"}</div>
                        <div className="text-neutral-400 font-mono text-[11px]">{r.email || "—"}</div>
                        <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                          UID: <span className="font-bold">{r.id}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider ${badgeTone(r.role)}`}>
                          {r.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="text-neutral-900 dark:text-white font-black uppercase tracking-tight">{r.plan}</div>
                        <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">{r.subscriptionStatus}</div>
                      </td>

                      <td className="py-3.5 px-3 font-mono text-[11px] text-neutral-500 space-y-0.5">
                        <div>sId: <span className="font-bold text-neutral-900 dark:text-neutral-300">{r.sellerId}</span></div>
                        <div>rId: <span className="font-bold text-neutral-900 dark:text-neutral-300">{r.regionId || "—"}</span></div>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          <Link
                            href={`/admin/sellers/${r.id}`}
                            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-[11px] font-black px-3 py-1.5 transition uppercase tracking-wide"
                          >
                            {lang === "ja" ? "詳細" : lang === "en" ? "Details" : "Detalhes"}
                          </Link>

                          <button
                            disabled={isBusy || isDeleting}
                            onClick={() => updateSuspension(r.id, !r.suspended)}
                            className={`disabled:opacity-40 rounded-lg text-[11px] font-black px-3 py-1.5 border uppercase tracking-wide transition ${r.suspended ? "bg-emerald-500 text-white border-emerald-500" : "bg-red-50 dark:bg-red-950/20 text-red-600 border-red-200 dark:border-red-900/30"}`}
                          >
                            {r.suspended ? (lang === "ja" ? "解除" : lang === "en" ? "Unsuspend" : "Reativar") : (lang === "ja" ? "停止" : lang === "en" ? "Suspend" : "Suspender")}
                          </button>

                          <button
                            disabled={isBusy || isDeleting}
                            onClick={() => updateActivation(r.id, !r.active)}
                            className={`disabled:opacity-40 rounded-lg text-[11px] font-black px-3 py-1.5 border uppercase tracking-wide transition ${r.active ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 border-amber-200 dark:border-amber-900/30" : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 border-emerald-200 dark:border-emerald-900/30"}`}
                          >
                            {r.active ? (lang === "ja" ? "無効化" : lang === "en" ? "Deactivate" : "Inativar") : (lang === "ja" ? "有効化" : lang === "en" ? "Activate" : "Ativar")}
                          </button>

                          <button
                            disabled={isBusy || isDeleting}
                            onClick={() => updateRole(r.id, r.role === "admin" ? "seller" : "admin")}
                            className="disabled:opacity-40 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-[11px] font-black px-3 py-1.5 uppercase tracking-wide transition"
                          >
                            {r.role === "admin" ? (lang === "ja" ? "降格" : lang === "en" ? "Demote" : "Rebaixar") : (lang === "ja" ? "管理者へ昇格" : lang === "en" ? "Promote" : "Promover")}
                          </button>

                          {r.role !== "admin" && (
                            <button
                              disabled={isBusy || isDeleting}
                              onClick={() => hardDeleteSeller(r.id)}
                              className="disabled:opacity-40 rounded-lg bg-red-600 text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wide transition shadow-sm"
                            >
                              {isDeleting ? "..." : (lang === "ja" ? "物理削除" : lang === "en" ? "Delete" : "Excluir")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!filtered.length && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-400 font-bold italic">
                      {lang === "ja" ? "ユーザーが見つかりません。" : lang === "en" ? "No users matched your criteria." : "Nenhum usuário encontrado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function normalizeUserRow(docId: string, data: any): UserRow {
  const role: "admin" | "seller" = data.role === "admin" ? "admin" : "seller";
  return {
    id: docId,
    email: data.email ?? null,
    displayName: data.displayName ?? null,
    role,
    active: data.active !== false,
    suspended: !!data.suspended,
    sellerId: norm(data.sellerId) || docId,
    regionId: norm(data.regionId),
    plan: (data.plan as PlanId) || "starter",
    subscriptionStatus: (data.subscriptionStatus as SubscriptionStatus) || "none",
  };
}

async function mergeSellerData(list: UserRow[]): Promise<UserRow[]> {
  const sellerUids = list.filter((r) => r.role === "seller").map((r) => r.id);
  if (!sellerUids.length) return list;

  const chunks: string[][] = [];
  for (let i = 0; i < sellerUids.length; i += 10) chunks.push(sellerUids.slice(i, i + 10));

  const sellerMap = new Map<string, { plan?: PlanId; subscriptionStatus?: SubscriptionStatus; regionId?: string | null }>();

  for (const chunk of chunks) {
    const qs = query(collection(db, "sellers"), where(documentId(), "in", chunk));
    const snap = await getDocs(qs);
    snap.forEach((d) => {
      const s = d.data() as any;
      sellerMap.set(d.id, {
        plan: s.plan || undefined,
        subscriptionStatus: s.subscriptionStatus || undefined,
        regionId: s.regionId ?? null,
      });
    });
  }

  return list.map((r) => {
    if (r.role !== "seller") return r;
    const s = sellerMap.get(r.id);
    return {
      ...r,
      plan: (s?.plan as any) || r.plan || "starter",
      subscriptionStatus: (s?.subscriptionStatus as any) || r.subscriptionStatus || "none",
      regionId: r.regionId || (s?.regionId || "") || "",
      sellerId: r.id,
    };
  });
}