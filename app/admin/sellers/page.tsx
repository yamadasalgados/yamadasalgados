"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
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

type BusyAction = "toggle" | "delete" | "";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "seller";
  active: boolean;
  suspended: boolean;
  sellerId: string;
  regionId: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
};

const EMPTY_BUSY_MAP: Record<string, BusyAction> = {};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePlan(value: unknown): PlanId {
  return value === "pro" || value === "business"
    ? value
    : "starter";
}

function normalizeSubscriptionStatus(
  value: unknown
): SubscriptionStatus {
  return value === "pending" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled"
    ? value
    : "none";
}

function badgeTone(role: UserRow["role"]): string {
  return role === "admin"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "border-neutral-200 bg-neutral-500/10 text-neutral-800 dark:border-neutral-800 dark:text-neutral-300";
}

function normalizeUserRow(
  snapshot: QueryDocumentSnapshot<DocumentData>
): UserRow {
  const data = snapshot.data();
  const role: UserRow["role"] =
    data.role === "admin" ? "admin" : "seller";

  return {
    id: snapshot.id,
    email: text(data.email),
    displayName: text(data.displayName ?? data.name),
    role,
    active: data.active !== false,
    suspended: data.suspended === true,
    sellerId: text(data.sellerId) || snapshot.id,
    regionId: text(data.regionId),
    plan: normalizePlan(data.plan),
    subscriptionStatus: normalizeSubscriptionStatus(
      data.subscriptionStatus
    ),
  };
}

export default function AdminSellersPage() {
  const { t, lang } = useI18n();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [onlySellers, setOnlySellers] = useState(true);
  const [busyMap, setBusyMap] =
    useState<Record<string, BusyAction>>(EMPTY_BUSY_MAP);

  const translate = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value && value !== key ? value : fallback;
    },
    [t]
  );

  const setBusy = useCallback(
    (userId: string, action: BusyAction) => {
      setBusyMap((previous) => ({
        ...previous,
        [userId]: action,
      }));
    },
    []
  );

  const getStatus = useCallback(
    (active: boolean, suspended: boolean) => {
      if (suspended) {
        return {
          label:
            lang === "ja"
              ? "アカウント停止中"
              : lang === "en"
                ? "Suspended"
                : "Suspenso",
          className:
            "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
        };
      }

      if (!active) {
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
    },
    [lang]
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      let snapshot;

      try {
        snapshot = await getDocs(
          query(
            collection(db, "users"),
            orderBy("createdAt", "desc"),
            limit(300)
          )
        );
      } catch {
        snapshot = await getDocs(
          query(collection(db, "users"), limit(300))
        );

        setMessage(
          lang === "ja"
            ? "警告：一部のユーザーに作成日時がありません。"
            : lang === "en"
              ? "Warning: some users lack a creation timestamp."
              : "Aviso: alguns usuários não têm data de criação."
        );
      }

const normalizedRows = snapshot.docs.map(normalizeUserRow);

setRows(normalizedRows);
    } catch (error) {
      console.error("[AdminSellers] loadUsers:", error);

      setMessage(
        lang === "ja"
          ? "データの読み込みに失敗しました。"
          : lang === "en"
            ? "Failed to load users."
            : "Falha ao carregar usuários."
      );

      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredRows = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    const result = rows.filter((row) => {
      if (onlySellers && row.role !== "seller") return false;
      if (!search) return true;

      return [
        row.email,
        row.displayName,
        row.id,
        row.sellerId,
        row.regionId,
        row.plan,
        row.subscriptionStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    return [...result].sort((first, second) => {
      if (first.role !== second.role) {
        return first.role === "admin" ? -1 : 1;
      }

      const firstName =
        first.displayName || first.email || first.id;
      const secondName =
        second.displayName || second.email || second.id;

      return firstName.localeCompare(secondName, "pt-BR");
    });
  }, [onlySellers, rows, searchText]);

  const updateUserAndSeller = useCallback(
    async (
      user: UserRow,
      patch: Record<string, unknown>
    ) => {
      await updateDoc(doc(db, "users", user.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });

      if (user.role === "seller" && user.sellerId) {
        try {
          await updateDoc(doc(db, "sellers", user.sellerId), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          console.warn(
            "[AdminSellers] seller mirror update skipped:",
            error
          );
        }
      }
    },
    []
  );

  const updateSuspension = useCallback(
    async (user: UserRow) => {
      setMessage("");
      setBusy(user.id, "toggle");

      try {
        const suspended = !user.suspended;

        await updateUserAndSeller(user, { suspended });

        setRows((previous) =>
          previous.map((row) =>
            row.id === user.id ? { ...row, suspended } : row
          )
        );
      } catch (error) {
        console.error("[AdminSellers] suspension:", error);

        setMessage(
          lang === "ja"
            ? "ステータスの更新に失敗しました。"
            : lang === "en"
              ? "Failed to update suspension status."
              : "Falha ao atualizar suspensão."
        );
      } finally {
        setBusy(user.id, "");
      }
    },
    [lang, setBusy, updateUserAndSeller]
  );

  const updateActivation = useCallback(
    async (user: UserRow) => {
      setMessage("");
      setBusy(user.id, "toggle");

      try {
        const active = !user.active;

        await updateUserAndSeller(user, { active });

        setRows((previous) =>
          previous.map((row) =>
            row.id === user.id ? { ...row, active } : row
          )
        );
      } catch (error) {
        console.error("[AdminSellers] activation:", error);

        setMessage(
          lang === "ja"
            ? "アクティベーション状態の更新に失敗しました。"
            : lang === "en"
              ? "Failed to update activation status."
              : "Falha ao atualizar ativo/inativo."
        );
      } finally {
        setBusy(user.id, "");
      }
    },
    [lang, setBusy, updateUserAndSeller]
  );

  const updateRole = useCallback(
    async (user: UserRow) => {
      setMessage("");
      setBusy(user.id, "toggle");

      try {
        const role: UserRow["role"] =
          user.role === "admin" ? "seller" : "admin";

        await updateDoc(doc(db, "users", user.id), {
          role,
          updatedAt: serverTimestamp(),
        });

        setRows((previous) =>
          previous.map((row) =>
            row.id === user.id ? { ...row, role } : row
          )
        );
      } catch (error) {
        console.error("[AdminSellers] role:", error);

        setMessage(
          lang === "ja"
            ? "権限の更新に失敗しました。"
            : lang === "en"
              ? "Failed to update role."
              : "Falha ao atualizar role."
        );
      } finally {
        setBusy(user.id, "");
      }
    },
    [lang, setBusy]
  );

  const hardDeleteSeller = useCallback(
    async (user: UserRow) => {
      const confirmation =
        lang === "ja"
          ? "⚠️ 注意！\n\n販売者とすべての関連データを完全に削除します。続行しますか？"
          : lang === "en"
            ? "⚠️ WARNING!\n\nThis permanently deletes the seller and all associated data. Continue?"
            : "⚠️ ATENÇÃO!\n\nIsso apagará definitivamente o seller e todos os dados relacionados. Continuar?";

      if (!window.confirm(confirmation)) return;

      setMessage("");
      setBusy(user.id, "delete");

      try {
        await deleteSellerFromAdmin(user.id);

        setRows((previous) =>
          previous.filter((row) => row.id !== user.id)
        );
      } catch (error) {
        console.error("[AdminSellers] delete:", error);

        setMessage(
          lang === "ja"
            ? "削除に失敗しました。"
            : lang === "en"
              ? "Failed to delete seller."
              : "Falha ao apagar seller."
        );
      } finally {
        setBusy(user.id, "");
      }
    },
    [lang, setBusy]
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 overflow-x-hidden animate-fade-in">
      <section className="space-y-4 rounded-[2rem] border border-neutral-200 bg-neutral-50 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/40 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-sm font-black uppercase tracking-widest text-neutral-500">
              Sellers &amp; Users
            </h1>

            <p className="text-xs font-medium leading-relaxed text-neutral-400">
              {lang === "ja"
                ? "ユーザーの検索、ステータス変更、権限管理、完全削除を行います。"
                : lang === "en"
                  ? "Search users and manage status, roles, and permanent deletion."
                  : "Busque usuários e gerencie status, permissões e exclusão definitiva."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="self-start rounded-xl bg-black px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm transition disabled:opacity-40 dark:bg-white dark:text-black sm:self-center"
          >
            {translate("common.reload", "Atualizar")}
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
          <input
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
            placeholder={
              lang === "ja"
                ? "メール、名前、UID、地域、プランで検索..."
                : lang === "en"
                  ? "Search by email, name, UID, region, or plan..."
                  : "Buscar por email, nome, UID, região ou plano..."
            }
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
          />

          <label className="flex cursor-pointer items-center gap-2 self-start whitespace-nowrap text-xs font-black uppercase tracking-wider text-neutral-500 md:self-center">
            <input
              type="checkbox"
              checked={onlySellers}
              onChange={(event) =>
                setOnlySellers(event.target.checked)
              }
              className="h-4 w-4 rounded accent-black dark:accent-white"
            />

            <span>
              {lang === "ja"
                ? "販売者のみ"
                : lang === "en"
                  ? "Sellers only"
                  : "Apenas sellers"}
            </span>
          </label>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-xs font-bold text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-[2rem] border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" />
      ) : filteredRows.length === 0 ? (
        <div className="rounded-[2rem] border-2 border-dashed border-neutral-200 px-4 py-16 text-center text-sm font-bold text-neutral-400 dark:border-neutral-800">
          {lang === "ja"
            ? "ユーザーが見つかりません。"
            : lang === "en"
              ? "No users matched your search."
              : "Nenhum usuário encontrado."}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 lg:hidden">
            {filteredRows.map((user) => (
              <MobileUserCard
                key={user.id}
                user={user}
                busy={busyMap[user.id] ?? ""}
                status={getStatus(
                  user.active,
                  user.suspended
                )}
                lang={lang}
                onSuspension={() =>
                  void updateSuspension(user)
                }
                onActivation={() =>
                  void updateActivation(user)
                }
                onRole={() => void updateRole(user)}
                onDelete={() =>
                  void hardDeleteSeller(user)
                }
              />
            ))}
          </section>

          <section className="hidden overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-100 text-left font-black uppercase tracking-wider text-neutral-400 dark:border-neutral-800/60">
                    <th className="px-3 py-3">User</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Plan</th>
                    <th className="px-3 py-3">IDs</th>
                    <th className="px-3 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-100 font-medium dark:divide-neutral-800/40">
                  {filteredRows.map((user) => {
                    const status = getStatus(
                      user.active,
                      user.suspended
                    );
                    const busy = busyMap[user.id] ?? "";

                    return (
                      <tr
                        key={user.id}
                        className="transition hover:bg-neutral-50/50 dark:hover:bg-neutral-900/20"
                      >
                        <td className="px-3 py-3.5">
                          <div className="font-black text-neutral-900 dark:text-white">
                            {user.displayName || "—"}
                          </div>
                          <div className="font-mono text-[11px] text-neutral-400">
                            {user.email || "—"}
                          </div>
                        </td>

                        <td className="px-3 py-3.5">
                          <Badge
                            className={badgeTone(user.role)}
                          >
                            {user.role}
                          </Badge>
                        </td>

                        <td className="px-3 py-3.5">
                          <Badge
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        </td>

                        <td className="px-3 py-3.5">
                          <div className="font-black uppercase text-neutral-900 dark:text-white">
                            {user.plan}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                            {user.subscriptionStatus}
                          </div>
                        </td>

                        <td className="px-3 py-3.5 font-mono text-[11px] text-neutral-500">
                          <div>sId: {user.sellerId}</div>
                          <div>rId: {user.regionId || "—"}</div>
                        </td>

                        <td className="px-3 py-3.5">
                          <Actions
                            user={user}
                            busy={busy}
                            lang={lang}
                            onSuspension={() =>
                              void updateSuspension(user)
                            }
                            onActivation={() =>
                              void updateActivation(user)
                            }
                            onRole={() =>
                              void updateRole(user)
                            }
                            onDelete={() =>
                              void hardDeleteSeller(user)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

function MobileUserCard({
  user,
  busy,
  status,
  lang,
  onSuspension,
  onActivation,
  onRole,
  onDelete,
}: {
  user: UserRow;
  busy: BusyAction;
  status: { label: string; className: string };
  lang: string;
  onSuspension: () => void;
  onActivation: () => void;
  onRole: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="min-w-0 space-y-4 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="min-w-0">
        <div className="truncate font-black text-neutral-900 dark:text-white">
          {user.displayName || "—"}
        </div>
        <div className="truncate text-xs text-neutral-400">
          {user.email || "—"}
        </div>
        <div className="mt-1 break-all font-mono text-[10px] text-neutral-400">
          UID: {user.id}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge className={badgeTone(user.role)}>
          {user.role}
        </Badge>
        <Badge className={status.className}>
          {status.label}
        </Badge>
        <Badge className="border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
          {user.plan}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <Info label="Seller ID" value={user.sellerId} />
        <Info
          label="Region ID"
          value={user.regionId || "—"}
        />
        <Info
          label="Subscription"
          value={user.subscriptionStatus}
        />
      </div>

      <Actions
        user={user}
        busy={busy}
        lang={lang}
        onSuspension={onSuspension}
        onActivation={onActivation}
        onRole={onRole}
        onDelete={onDelete}
        mobile
      />
    </article>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="break-all text-xs font-bold text-neutral-800 dark:text-neutral-200">
        {value}
      </div>
    </div>
  );
}

function Actions({
  user,
  busy,
  lang,
  onSuspension,
  onActivation,
  onRole,
  onDelete,
  mobile = false,
}: {
  user: UserRow;
  busy: BusyAction;
  lang: string;
  onSuspension: () => void;
  onActivation: () => void;
  onRole: () => void;
  onDelete: () => void;
  mobile?: boolean;
}) {
  const disabled = busy !== "";

  return (
    <div
      className={`flex flex-wrap gap-2 ${
        mobile ? "" : "justify-end"
      }`}
    >
      <Link
        href={`/admin/sellers/${user.id}`}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
      >
        {lang === "ja"
          ? "詳細"
          : lang === "en"
            ? "Details"
            : "Detalhes"}
      </Link>

      <ActionButton
        disabled={disabled}
        onClick={onSuspension}
      >
        {user.suspended
          ? lang === "ja"
            ? "解除"
            : lang === "en"
              ? "Unsuspend"
              : "Reativar"
          : lang === "ja"
            ? "停止"
            : lang === "en"
              ? "Suspend"
              : "Suspender"}
      </ActionButton>

      <ActionButton
        disabled={disabled}
        onClick={onActivation}
      >
        {user.active
          ? lang === "ja"
            ? "無効化"
            : lang === "en"
              ? "Deactivate"
              : "Inativar"
          : lang === "ja"
            ? "有効化"
            : lang === "en"
              ? "Activate"
              : "Ativar"}
      </ActionButton>

      <ActionButton disabled={disabled} onClick={onRole}>
        {user.role === "admin"
          ? lang === "ja"
            ? "降格"
            : lang === "en"
              ? "Demote"
              : "Rebaixar"
          : lang === "ja"
            ? "管理者へ昇格"
            : lang === "en"
              ? "Promote"
              : "Promover"}
      </ActionButton>

      {user.role !== "admin" && (
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="rounded-lg bg-red-600 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-sm disabled:opacity-40"
        >
          {busy === "delete"
            ? "..."
            : lang === "ja"
              ? "削除"
              : lang === "en"
                ? "Delete"
                : "Excluir"}
        </button>
      )}
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
      className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-neutral-800 transition disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
    >
      {children}
    </button>
  );
}
