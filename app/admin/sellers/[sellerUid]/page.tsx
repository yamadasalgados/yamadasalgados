"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/app/lib/firebase";
import { deleteSellerFromAdmin } from "@/app/lib/deleteSeller";
import { useI18n } from "@/app/lib/i18n";

type PlanId = "starter" | "pro" | "business";
type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

type FirestoreDate = Timestamp | Date | string | number | null;

type UserDoc = {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  role?: "admin" | "seller";
  active?: boolean;
  suspended?: boolean;
  sellerId?: string;
  regionId?: string;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
};

type SellerDoc = {
  sellerId: string;
  active?: boolean;
  suspended?: boolean;
  status?: string;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  regionId?: string;
  regionName?: string;
  limits?: {
    maxEvents?: number;
    maxProducts?: number;
  };
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
};

type Stats = {
  productsTotal: number;
  eventsTotal: number;
  eventsActive: number;
  ordersTotal: number;
  ordersPending: number;
};

type BusyAction = "" | "toggle" | "delete";

export default function AdminSellerDetailPage() {
  const params = useParams<{ sellerUid?: string }>();
  const router = useRouter();
  const { t, lang } = useI18n();

  const sellerUid = String(params?.sellerUid ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [userData, setUserData] = useState<UserDoc | null>(
    null
  );
  const [sellerData, setSellerData] =
    useState<SellerDoc | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<BusyAction>("");

  const translate = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value && value !== key ? value : fallback;
    },
    [t]
  );

  const formatBoolean = useCallback(
    (value: boolean | undefined) => {
      if (value === true) {
        return translate(
          "admin.sellerDetail.activeTrue",
          lang === "ja"
            ? "はい"
            : lang === "en"
              ? "Yes"
              : "Sim"
        );
      }

      if (value === false) {
        return translate(
          "admin.sellerDetail.activeFalse",
          lang === "ja"
            ? "いいえ"
            : lang === "en"
              ? "No"
              : "Não"
        );
      }

      return "—";
    },
    [lang, translate]
  );

  const loadStats = useCallback(
    async (resolvedSellerId: string): Promise<Stats> => {
      const productsCollection = collection(
        db,
        "sellers",
        resolvedSellerId,
        "products"
      );

      const eventsCollection = collection(
        db,
        "sellers",
        resolvedSellerId,
        "events"
      );

      const [
        productsCountSnapshot,
        eventsSnapshot,
        activeEventsCountSnapshot,
      ] = await Promise.all([
        getCountFromServer(query(productsCollection)),
        getDocs(query(eventsCollection)),
        getCountFromServer(
          query(
            eventsCollection,
            where("status", "==", "active")
          )
        ),
      ]);

      const orderCounts = await Promise.all(
        eventsSnapshot.docs.map(async (eventSnapshot) => {
          const ordersCollection = collection(
            db,
            "sellers",
            resolvedSellerId,
            "events",
            eventSnapshot.id,
            "orders"
          );

          const [totalSnapshot, pendingSnapshot] =
            await Promise.all([
              getCountFromServer(query(ordersCollection)),
              getCountFromServer(
                query(
                  ordersCollection,
                  where("status", "==", "pending")
                )
              ),
            ]);

          return {
            total: totalSnapshot.data().count,
            pending: pendingSnapshot.data().count,
          };
        })
      );

      return {
        productsTotal: productsCountSnapshot.data().count,
        eventsTotal: eventsSnapshot.size,
        eventsActive: activeEventsCountSnapshot.data().count,
        ordersTotal: orderCounts.reduce(
          (sum, count) => sum + count.total,
          0
        ),
        ordersPending: orderCounts.reduce(
          (sum, count) => sum + count.pending,
          0
        ),
      };
    },
    []
  );

  const load = useCallback(async () => {
    setErrorMessage("");
    setLoading(true);
    setStats(null);

    if (!sellerUid) {
      setErrorMessage(
        lang === "ja"
          ? "ルートパラメーターが無効です。"
          : lang === "en"
            ? "Invalid seller route parameter."
            : "ID inválido na rota."
      );
      setUserData(null);
      setSellerData(null);
      setLoading(false);
      return;
    }

    try {
      const userReference = doc(db, "users", sellerUid);
      const userSnapshot = await getDoc(userReference);

      const loadedUser = userSnapshot.exists()
        ? ({
            uid: sellerUid,
            ...userSnapshot.data(),
          } as UserDoc)
        : null;

      const resolvedSellerId =
        loadedUser?.sellerId?.trim() || sellerUid;

      const sellerReference = doc(
        db,
        "sellers",
        resolvedSellerId
      );

      const sellerSnapshot = await getDoc(sellerReference);

      const loadedSeller = sellerSnapshot.exists()
        ? ({
            sellerId: resolvedSellerId,
            ...sellerSnapshot.data(),
          } as SellerDoc)
        : null;

      setUserData(loadedUser);
      setSellerData(loadedSeller);

      try {
        setStats(await loadStats(resolvedSellerId));
      } catch (statsError) {
        console.warn(
          "[AdminSellerDetail] stats unavailable:",
          statsError
        );
        setStats(null);
      }
    } catch (error) {
      console.error("[AdminSellerDetail] load:", error);

      setErrorMessage(
        lang === "ja"
          ? "詳細データの読み込みに失敗しました。"
          : lang === "en"
            ? "Failed to load seller details."
            : "Falha ao carregar detalhes do seller."
      );
    } finally {
      setLoading(false);
    }
  }, [lang, loadStats, sellerUid]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedSellerId =
    userData?.sellerId?.trim() || sellerUid;

  const isAdminUser = userData?.role === "admin";

  const status = useMemo(() => {
    if (userData?.suspended) {
      return {
        label:
          lang === "ja"
            ? "停止中"
            : lang === "en"
              ? "Suspended"
              : "Suspenso",
        className:
          "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
      };
    }

    if (userData?.active === false) {
      return {
        label:
          lang === "ja"
            ? "無効"
            : lang === "en"
              ? "Inactive"
              : "Inativo",
        className:
          "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    }

    return {
      label:
        lang === "ja"
          ? "有効"
          : lang === "en"
            ? "Active"
            : "Ativo",
      className:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }, [lang, userData?.active, userData?.suspended]);

  const updateUserAndSeller = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!sellerUid) return;

      await updateDoc(doc(db, "users", sellerUid), {
        ...patch,
        updatedAt: serverTimestamp(),
      });

      if (resolvedSellerId) {
        try {
          await updateDoc(
            doc(db, "sellers", resolvedSellerId),
            {
              ...patch,
              updatedAt: serverTimestamp(),
            }
          );
        } catch (error) {
          console.warn(
            "[AdminSellerDetail] seller mirror skipped:",
            error
          );
        }
      }
    },
    [resolvedSellerId, sellerUid]
  );

  const setSuspended = useCallback(
    async (suspended: boolean) => {
      setErrorMessage("");
      setBusy("toggle");

      try {
        await updateUserAndSeller({ suspended });
        await load();
      } catch (error) {
        console.error(
          "[AdminSellerDetail] suspension:",
          error
        );

        setErrorMessage(
          lang === "ja"
            ? "ステータスの更新に失敗しました。"
            : lang === "en"
              ? "Failed to update suspension status."
              : "Falha ao atualizar suspensão."
        );
      } finally {
        setBusy("");
      }
    },
    [lang, load, updateUserAndSeller]
  );

  const setActive = useCallback(
    async (active: boolean) => {
      setErrorMessage("");
      setBusy("toggle");

      try {
        await updateUserAndSeller({ active });
        await load();
      } catch (error) {
        console.error(
          "[AdminSellerDetail] activation:",
          error
        );

        setErrorMessage(
          lang === "ja"
            ? "有効状態の更新に失敗しました。"
            : lang === "en"
              ? "Failed to update activation status."
              : "Falha ao atualizar ativo/inativo."
        );
      } finally {
        setBusy("");
      }
    },
    [lang, load, updateUserAndSeller]
  );

  const hardDeleteSeller = useCallback(async () => {
    if (!sellerUid || isAdminUser) {
      setErrorMessage(
        lang === "ja"
          ? "管理者アカウントはここから削除できません。"
          : lang === "en"
            ? "Admin accounts cannot be deleted here."
            : "Contas admin não podem ser apagadas aqui."
      );
      return;
    }

    const firstConfirmation =
      lang === "ja"
        ? "⚠️ 販売者とすべての関連データを完全に削除します。続行しますか？"
        : lang === "en"
          ? "⚠️ This permanently deletes the seller and all associated data. Continue?"
          : "⚠️ Isso apagará definitivamente o seller e todos os dados relacionados. Continuar?";

    if (!window.confirm(firstConfirmation)) return;

    const secondConfirmation =
      lang === "ja"
        ? "最終確認：本当に完全削除しますか？"
        : lang === "en"
          ? "Final confirmation: permanently erase this seller?"
          : "Confirmação final: deseja realmente apagar este seller?";

    if (!window.confirm(secondConfirmation)) return;

    setErrorMessage("");
    setBusy("delete");

    try {
      await deleteSellerFromAdmin(sellerUid);
      router.push("/admin/sellers");
    } catch (error) {
      console.error("[AdminSellerDetail] delete:", error);

      setErrorMessage(
        lang === "ja"
          ? "削除処理に失敗しました。"
          : lang === "en"
            ? "Failed to delete seller."
            : "Falha ao apagar seller."
      );
    } finally {
      setBusy("");
    }
  }, [isAdminUser, lang, router, sellerUid]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 overflow-x-hidden animate-fade-in">
      <header className="flex min-w-0 flex-col gap-4 border-b border-neutral-200 pb-5 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white sm:text-3xl">
            {translate(
              "admin.sellerDetail.title",
              lang === "ja"
                ? "販売者の詳細"
                : lang === "en"
                  ? "Seller details"
                  : "Detalhes do seller"
            )}
          </h1>

          <p className="break-all font-mono text-[11px] text-neutral-400">
            userUid: {sellerUid || "—"}
          </p>

          <p className="break-all font-mono text-[11px] text-neutral-400">
            sellerId: {resolvedSellerId || "—"}
          </p>
        </div>

        <Link
          href="/admin/sellers"
          className="self-start rounded-xl border border-neutral-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-neutral-800 transition dark:border-neutral-800 dark:bg-neutral-900 dark:text-white sm:self-center"
        >
          {translate("common.back", "Voltar")}
        </Link>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs font-bold text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="h-44 animate-pulse rounded-[2.5rem] border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="min-w-0 space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h2 className="min-w-0 break-all text-xs font-black uppercase tracking-widest text-neutral-400">
                users/{sellerUid}
              </h2>

              <span
                className={`shrink-0 rounded-md border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${status.className}`}
              >
                {status.label}
              </span>
            </div>

            {!userData ? (
              <EmptyText>
                {translate(
                  "admin.sellerDetail.noUser",
                  "Documento do usuário não encontrado."
                )}
              </EmptyText>
            ) : (
              <div className="space-y-4">
                <InfoBlock
                  label={translate(
                    "products.form.name",
                    "Nome"
                  )}
                  value={userData.displayName || "—"}
                />

                <InfoBlock
                  label="Email"
                  value={userData.email || "—"}
                  breakAll
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <ActionButton
                    disabled={busy !== ""}
                    onClick={() =>
                      void setSuspended(!userData.suspended)
                    }
                  >
                    {userData.suspended
                      ? lang === "ja"
                        ? "停止解除"
                        : lang === "en"
                          ? "Unsuspend"
                          : "Retirar suspensão"
                      : lang === "ja"
                        ? "停止"
                        : lang === "en"
                          ? "Suspend"
                          : "Suspender"}
                  </ActionButton>

                  <ActionButton
                    disabled={busy !== ""}
                    onClick={() =>
                      void setActive(
                        userData.active === false
                      )
                    }
                  >
                    {userData.active === false
                      ? lang === "ja"
                        ? "有効化"
                        : lang === "en"
                          ? "Activate"
                          : "Ativar"
                      : lang === "ja"
                        ? "無効化"
                        : lang === "en"
                          ? "Deactivate"
                          : "Inativar"}
                  </ActionButton>
                </div>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <h2 className="break-all text-xs font-black uppercase tracking-widest text-neutral-400">
              sellers/{resolvedSellerId}
            </h2>

            {!sellerData ? (
              <EmptyText>
                {translate(
                  "admin.sellerDetail.noSeller",
                  "Documento do seller não encontrado."
                )}
              </EmptyText>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <InfoBlock
                    label="Plan"
                    value={sellerData.plan || "starter"}
                  />

                  <InfoBlock
                    label="Subscription"
                    value={
                      sellerData.subscriptionStatus || "none"
                    }
                  />
                </div>

                <div className="space-y-1 border-t border-neutral-200 pt-3 font-mono text-[11px] text-neutral-400 dark:border-neutral-800">
                  <div>
                    active:{" "}
                    <strong className="text-neutral-700 dark:text-neutral-300">
                      {formatBoolean(sellerData.active)}
                    </strong>
                  </div>

                  <div>
                    suspended:{" "}
                    <strong className="text-neutral-700 dark:text-neutral-300">
                      {formatBoolean(sellerData.suspended)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="flex min-w-0 flex-col justify-between gap-5 rounded-3xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">
                {lang === "ja"
                  ? "統計"
                  : lang === "en"
                    ? "Statistics"
                    : "Estatísticas"}
              </h2>

              {!stats ? (
                <EmptyText>
                  {translate(
                    "admin.sellerDetail.noStats",
                    "Estatísticas indisponíveis."
                  )}
                </EmptyText>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label={
                      lang === "ja"
                        ? "商品"
                        : lang === "en"
                          ? "Products"
                          : "Produtos"
                    }
                    value={stats.productsTotal}
                  />

                  <StatCard
                    label={
                      lang === "ja"
                        ? "イベント"
                        : lang === "en"
                          ? "Events"
                          : "Eventos"
                    }
                    value={stats.eventsTotal}
                  />

                  <StatCard
                    label={
                      lang === "ja"
                        ? "有効イベント"
                        : lang === "en"
                          ? "Active events"
                          : "Eventos ativos"
                    }
                    value={stats.eventsActive}
                  />

                  <StatCard
                    label={
                      lang === "ja"
                        ? "注文"
                        : lang === "en"
                          ? "Orders"
                          : "Pedidos"
                    }
                    value={stats.ordersTotal}
                  />

                  <StatCard
                    label={
                      lang === "ja"
                        ? "保留中"
                        : lang === "en"
                          ? "Pending"
                          : "Pendentes"
                    }
                    value={stats.ordersPending}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <p className="text-[10px] font-bold leading-relaxed text-neutral-400">
                {translate(
                  "admin.sellerDetail.deleteWarning",
                  "A exclusão é permanente e remove todos os dados vinculados."
                )}
              </p>

              <button
                type="button"
                disabled={
                  busy !== "" || isAdminUser || !sellerUid
                }
                onClick={() => void hardDeleteSeller()}
                className="w-full rounded-xl bg-red-600 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition disabled:opacity-40"
              >
                {busy === "delete"
                  ? translate(
                      "admin.sellerDetail.deleting",
                      "Excluindo..."
                    )
                  : translate(
                      "admin.sellerDetail.deleteBtn",
                      "Excluir seller"
                    )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function InfoBlock({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
        {label}
      </div>

      <div
        className={`text-sm font-black text-neutral-900 dark:text-white ${
          breakAll ? "break-all" : "break-words"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyText({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 text-xs font-bold italic text-neutral-400">
      {children}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-black uppercase tracking-wide text-neutral-800 transition disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="break-words text-[9px] font-black uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-neutral-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}
