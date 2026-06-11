"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import AdminGuard from "@/app/_components/AdminGuard";
import { deleteSellerFromAdmin } from "@/app/lib/deleteSeller";
import { useI18n } from "@/app/lib/i18n";

type PlanId = "starter" | "pro" | "business";
type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";

type UserDoc = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role?: "admin" | "seller";
  active?: boolean;
  suspended?: boolean;
  sellerId?: string | null;
  regionId?: string | null;
  createdAt?: any;
  updatedAt?: any;
};

type SellerDoc = {
  sellerId: string;
  active?: boolean;
  suspended?: boolean;
  status?: string | null;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  regionId?: string | null;
  regionName?: string | null;
  limits?: { maxEvents?: number; maxProducts?: number };
  createdAt?: any;
  updatedAt?: any;
};

type Stats = {
  productsTotal: number;
  eventsTotal: number;
  eventsActive: number;
  ordersTotal: number;
  ordersPending: number;
};

export default function AdminSellerDetailPage() {
  return <AdminGuard>{() => <AdminSellerDetailInner />}</AdminGuard>;
}

function AdminSellerDetailInner() {
  const params = useParams();
  const router = useRouter();
  const { t, lang } = useI18n();

  const sellerId = String((params as any)?.sellerUid || "").trim();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [sellerDoc, setSellerDoc] = useState<SellerDoc | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [busy, setBusy] = useState<"" | "toggle" | "delete">("");

  const fmtBool = useCallback((v: any) => {
    if (v === true) return t("admin.sellerDetail.activeTrue");
    if (v === false) return t("admin.sellerDetail.activeFalse");
    return "—";
  }, [t]);

  const load = useCallback(async () => {
    setErrMsg("");
    setLoading(true);
    setStats(null);

    if (!sellerId) {
      setErrMsg(lang === "ja" ? "ルートパラメーターが無効です。" : lang === "en" ? "Invalid route ID parameter." : "ID inválido na rota (sellerUid vazio).");
      setUserDoc(null);
      setSellerDoc(null);
      setLoading(false);
      return;
    }

    try {
      const uRef = doc(db, "users", sellerId);
      const sRef = doc(db, "sellers", sellerId);

      const [uSnap, sSnap] = await Promise.all([getDoc(uRef), getDoc(sRef)]);

      setUserDoc(uSnap.exists() ? ({ uid: sellerId, ...((uSnap.data() as any) || {}) } as UserDoc) : null);
      setSellerDoc(sSnap.exists() ? ({ sellerId, ...((sSnap.data() as any) || {}) } as SellerDoc) : null);

      try {
        const productsCol = collection(db, "sellers", sellerId, "products");
        const eventsCol = collection(db, "sellers", sellerId, "events");
        const ordersCol = collection(db, "sellers", sellerId, "orders");

        const [
          productsCountSnap,
          eventsCountSnap,
          eventsActiveCountSnap,
          ordersCountSnap,
          ordersPendingCountSnap,
        ] = await Promise.all([
          getCountFromServer(query(productsCol)),
          getCountFromServer(query(eventsCol)),
          getCountFromServer(query(eventsCol, where("status", "==", "active"))),
          getCountFromServer(query(ordersCol)),
          getCountFromServer(query(ordersCol, where("status", "==", "pending"))),
        ]);

        setStats({
          productsTotal: productsCountSnap.data().count,
          eventsTotal: eventsCountSnap.data().count,
          eventsActive: eventsActiveCountSnap.data().count,
          ordersTotal: ordersCountSnap.data().count,
          ordersPending: ordersPendingCountSnap.data().count,
        });
      } catch {
        setStats(null);
      }
    } catch {
      setErrMsg(lang === "ja" ? "詳細データの読み込みに失敗しました。" : lang === "en" ? "Failed to load seller details." : "Falha ao carregar detalhes do seller.");
    } finally {
      setLoading(false);
    }
  }, [sellerId, lang]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdminUser = userDoc?.role === "admin";

  const statusChip = useMemo(() => {
    if (userDoc?.suspended) {
      return { 
        label: lang === "ja" ? "停止中" : lang === "en" ? "Suspended" : "Suspenso", 
        cls: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" 
      };
    }
    if (userDoc?.active === false) {
      return { 
        label: lang === "ja" ? "無効" : lang === "en" ? "Inactive" : "Inativo", 
        cls: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" 
      };
    }
    return { 
      label: lang === "ja" ? "有効" : lang === "en" ? "Active" : "Ativo", 
      cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" 
    };
  }, [userDoc?.active, userDoc?.suspended, lang]);

  async function setSuspended(suspended: boolean) {
    if (!sellerId) return;
    setErrMsg("");
    setBusy("toggle");
    try {
      await updateDoc(doc(db, "users", sellerId), { suspended, updatedAt: serverTimestamp() });
      try { await updateDoc(doc(db, "sellers", sellerId), { suspended, updatedAt: serverTimestamp() }); } catch {}
      await load();
    } catch {
      setErrMsg(lang === "ja" ? "ステータスの更新に失敗しました。" : lang === "en" ? "Failed to update suspension status." : "Falha ao atualizar suspensão.");
    } finally {
      setBusy("");
    }
  }

  async function setActive(active: boolean) {
    if (!sellerId) return;
    setErrMsg("");
    setBusy("toggle");
    try {
      await updateDoc(doc(db, "users", sellerId), { active, updatedAt: serverTimestamp() });
      try { await updateDoc(doc(db, "sellers", sellerId), { active, updatedAt: serverTimestamp() }); } catch {}
      await load();
    } catch {
      setErrMsg(lang === "ja" ? "有効状態의更新に失敗しました。" : lang === "en" ? "Failed to update activation status." : "Falha ao atualizar ativo/inativo.");
    } finally {
      setBusy("");
    }
  }

  async function hardDeleteSeller() {
    if (!sellerId) return;

    if (isAdminUser) {
      setErrMsg(lang === "ja" ? "管理者アカウントはここから物理削除できません。" : lang === "en" ? "Admin accounts cannot be deleted here." : "Você não pode apagar um usuário admin por aqui.");
      return;
    }

    setErrMsg("");
    setBusy("delete");
    try {
      const msgC1 = lang === "ja"
        ? "⚠️ 物理削除の実行\n\n次のデータが完全に削除されます：\n- users/[ID]\n- sellers/[ID] (配下のすべてのコレクション)\n\n本当に続行しますか？"
        : lang === "en"
        ? "⚠️ PERMANENT WIPE\n\nThis deletes:\n- users/[ID]\n- sellers/[ID] (and ALL content)\n\nContinue?"
        : "⚠️ EXCLUSÃO DEFINITIVA\n\nVai apagar:\n- users/[ID]\n- sellers/[ID] (e TUDO dentro)\n\nContinuar?";
      
      if (!confirm(msgC1)) return;

      const msgC2 = lang === "ja"
        ? "これが最後の警告です。完全に削除してもよろしいですか？"
        : lang === "en"
        ? "Final warning: are you absolutely sure you want to permanently erase this merchant?"
        : "Confirme novamente: deseja apagar DEFINITIVAMENTE este seller?";

      if (!confirm(msgC2)) return;

      await deleteSellerFromAdmin(sellerId);
      router.push("/admin/sellers");
    } catch {
      setErrMsg(lang === "ja" ? "削除処理に失敗しました。" : lang === "en" ? "Failed to execute permanent wipe." : "Falha ao apagar seller.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t("admin.sellerDetail.title")}
          </h1>
          <p className="text-xs font-mono text-neutral-400">
            sellerUid: <code className="font-bold text-neutral-600 dark:text-neutral-300">{sellerId || "—"}</code>
          </p>
        </div>

        <Link
          href="/admin/sellers"
          className="rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-5 py-3 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-white transition uppercase tracking-wider self-start sm:self-center"
        >
          {t("common.back")}
        </Link>
      </div>

      {errMsg && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 px-4 py-3.5 text-xs font-black uppercase tracking-wider">
          {errMsg}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-44 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem]" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* SEÇÃO USUÁRIO */}
          <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">users/{sellerId}</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider ${statusChip.cls}`}>{statusChip.label}</span>
            </div>

            {!userDoc ? (
              <div className="text-xs font-bold text-neutral-400 italic py-4">{t("admin.sellerDetail.noUser")}</div>
            ) : (
              <div className="space-y-4 font-medium">
                <div>
                  <div className="text-[10px] font-black uppercase text-neutral-400">{t("products.form.name")}</div>
                  <div className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">{userDoc.displayName || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase text-neutral-400">Email</div>
                  <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{userDoc.email || "—"}</div>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-2">
                  <button
                    disabled={busy !== ""}
                    onClick={() => setSuspended(!userDoc.suspended)}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-black py-2.5 uppercase tracking-wide transition disabled:opacity-40"
                  >
                    {userDoc.suspended ? t("products.btn.activate") : t("products.btn.deactivate")}
                  </button>

                  <button
                    disabled={busy !== ""}
                    onClick={() => setActive(userDoc.active === false)}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 text-xs font-black py-2.5 uppercase tracking-wide transition disabled:opacity-40"
                  >
                    {userDoc.active === false ? t("products.btn.activate") : t("products.btn.deactivate")}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SEÇÃO VENDEDOR */}
          <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">sellers/{sellerId}</h2>
            {!sellerDoc ? (
              <div className="text-xs font-bold text-neutral-400 italic py-4">{t("admin.sellerDetail.noSeller")}</div>
            ) : (
              <div className="space-y-4 font-medium">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase text-neutral-400">Plan</div>
                    <div className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-tight">{sellerDoc.plan || "starter"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-neutral-400">Subscription</div>
                    <div className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-tight">{sellerDoc.subscriptionStatus || "none"}</div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 pt-3 space-y-0.5">
                  <div>active: <span className="font-bold text-neutral-700 dark:text-neutral-300">{fmtBool(sellerDoc.active)}</span></div>
                  <div>suspended: <span className="font-bold text-neutral-700 dark:text-neutral-300">{fmtBool(sellerDoc.suspended)}</span></div>
                </div>
              </div>
            )}
          </section>

          {/* SEÇÃO ESTATÍSTICAS */}
          <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">{t("admin.home.card.events.desc")}</h2>

              {!stats ? (
                <div className="text-xs font-bold text-neutral-400 italic py-2">{t("admin.sellerDetail.noStats")}</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label={t("admin.products.seller.stock")} value={stats.productsTotal} />
                  <StatCard label={t("admin.home.card.events.title")} value={stats.eventsTotal} />
                  <StatCard label={t("products.badge.active")} value={stats.eventsActive} />
                  <StatCard label={t("eventPanel.tabs.orders")} value={stats.ordersTotal} />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="text-[10px] font-bold text-neutral-400 leading-tight">
                {t("admin.sellerDetail.deleteWarning")}
              </div>

              <button
                disabled={busy !== "" || isAdminUser || !sellerId}
                onClick={hardDeleteSeller}
                className="w-full rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-wider py-3.5 hover:opacity-90 shadow-md transition disabled:opacity-40"
              >
                {busy === "delete" ? t("admin.sellerDetail.deleting") : t("admin.sellerDetail.deleteBtn")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 rounded-xl shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="text-xl font-black text-neutral-900 dark:text-white mt-1">{value ?? 0}</div>
    </div>
  );
}