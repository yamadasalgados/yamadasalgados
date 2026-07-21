"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AdminGuard from "@/app/_components/AdminGuard";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

type PlanId = "starter" | "pro" | "business";
type PlanRequestType = "renew" | "upgrade" | "downgrade";
type PlanRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

type UserRole = "admin" | "seller" | "unknown";
type FilterId = "pending" | "active" | "suspended" | "all";

type UserRow = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  suspended: boolean;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodStart?: unknown;
  currentPeriodEnd?: unknown;
  inactiveSince?: unknown;
  requestedPlan?: PlanId;
  planRequestType?: PlanRequestType;
  planRequestStatus?: PlanRequestStatus;
  requestedPlanAt?: unknown;
  maxEvents?: number;
  maxProducts?: number;
};

const PLAN_ORDER: Record<PlanId, number> = {
  starter: 1,
  pro: 2,
  business: 3,
};

const PLAN_LIMITS: Record<
  PlanId,
  { maxEvents: number; maxProducts: number }
> = {
  starter: { maxEvents: 1, maxProducts: 20 },
  pro: { maxEvents: 3, maxProducts: 60 },
  business: { maxEvents: 10, maxProducts: 200 },
};

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;

  try {
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    ) {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number" || typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "seconds" in value &&
      typeof (value as { seconds?: unknown }).seconds === "number"
    ) {
      const date = new Date(
        (value as { seconds: number }).seconds * 1000
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  } catch {
    return null;
  }
}

function toMillisSafe(value: unknown): number {
  return toDateSafe(value)?.getTime() ?? 0;
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  return value === "pending" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled" ||
    value === "none"
    ? value
    : "none";
}

function normalizePlan(value: unknown): PlanId {
  return value === "pro" ||
    value === "business" ||
    value === "starter"
    ? value
    : "starter";
}

function normalizeRequestType(value: unknown): PlanRequestType | undefined {
  return value === "renew" ||
    value === "upgrade" ||
    value === "downgrade"
    ? value
    : undefined;
}

function normalizeRequestStatus(
  value: unknown
): PlanRequestStatus | undefined {
  return value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "cancelled"
    ? value
    : undefined;
}

function daysLeft(value?: unknown): number | null {
  const date = toDateSafe(value);
  if (!date) return null;

  return Math.ceil(
    (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

function addDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function requestedPlanFor(user: UserRow): PlanId {
  return user.requestedPlan ?? user.plan;
}

function inferredRequestType(user: UserRow): PlanRequestType {
  if (user.planRequestType) return user.planRequestType;

  const requested = requestedPlanFor(user);

  if (requested === user.plan) return "renew";

  return PLAN_ORDER[requested] > PLAN_ORDER[user.plan]
    ? "upgrade"
    : "downgrade";
}

export default function AdminSettingsPage() {
  return (
    <AdminGuard>
      {() => <AdminSettingsInner />}
    </AdminGuard>
  );
}

function AdminSettingsInner() {
  const { t, lang } = useI18n();

  const locale =
    lang === "en"
      ? "en-US"
      : lang === "ja"
        ? "ja-JP"
        : "pt-BR";

  const tt = useCallback(
    (key: string, fallback: string) => {
      const translated = t(key);
      return translated && translated !== key ? translated : fallback;
    },
    [t]
  );

  const fmtDate = useCallback(
    (value?: unknown) => {
      const date = toDateSafe(value);
      if (!date) return "—";

      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Tokyo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    },
    [locale]
  );

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FilterId>("pending");
  const [busyUid, setBusyUid] = useState("");

  const patchUser = useCallback(
    async (
      uid: string,
      patch: Record<string, unknown>,
      successMessage: string
    ) => {
      setErrMsg("");
      setOkMsg("");
      setBusyUid(uid);

      try {
        await updateDoc(doc(db, "users", uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });

        setUsers((previous) =>
          previous.map((user) =>
            user.uid === uid
              ? ({ ...user, ...patch } as UserRow)
              : user
          )
        );

        setOkMsg(successMessage);
        window.setTimeout(() => setOkMsg(""), 2500);
      } catch (error: unknown) {
        console.error("[AdminSettings] patchUser:", error);

        setErrMsg(
          error instanceof Error
            ? error.message
            : tt(
                "admin.settings.msg.updateError",
                "Não foi possível atualizar o usuário."
              )
        );
      } finally {
        setBusyUid("");
      }
    },
    [tt]
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrMsg("");

    try {
      const pendingQuery = query(
        collection(db, "users"),
        where("planRequestStatus", "==", "pending"),
        orderBy("requestedPlanAt", "desc"),
        limit(300)
      );

      const recentQuery = query(
        collection(db, "users"),
        orderBy("updatedAt", "desc"),
        limit(300)
      );

      const [pendingSnapshot, recentSnapshot] = await Promise.all([
        getDocs(pendingQuery).catch(() => null),
        getDocs(recentQuery).catch(() => null),
      ]);

      const byUid = new Map<string, Record<string, unknown>>();

      recentSnapshot?.docs.forEach((snapshot) => {
        byUid.set(snapshot.id, snapshot.data());
      });

      pendingSnapshot?.docs.forEach((snapshot) => {
        byUid.set(snapshot.id, snapshot.data());
      });

      const expiredUpdates: Array<{
        uid: string;
        patch: Record<string, unknown>;
      }> = [];

      const normalizedUsers = Array.from(byUid.entries()).map(
        ([uid, data]): UserRow => {
          const subscriptionStatus = normalizeSubscriptionStatus(
            data.subscriptionStatus
          );

          const currentPeriodEnd = data.currentPeriodEnd;
          const currentPeriodEndMs = toMillisSafe(currentPeriodEnd);

          const isExpired =
            subscriptionStatus === "active" &&
            currentPeriodEndMs > 0 &&
            currentPeriodEndMs < Date.now();

          if (isExpired) {
            expiredUpdates.push({
              uid,
              patch: {
                subscriptionStatus: "past_due",
                active: false,
                inactiveSince: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
            });
          }

          return {
            uid,
            email: String(data.email ?? ""),
            displayName: String(data.displayName ?? data.name ?? ""),
            role:
              data.role === "admin"
                ? "admin"
                : data.role === "seller"
                  ? "seller"
                  : "unknown",
            active: isExpired ? false : data.active !== false,
            suspended: data.suspended === true,
            plan: normalizePlan(data.plan),
            subscriptionStatus: isExpired
              ? "past_due"
              : subscriptionStatus,
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd,
            inactiveSince: data.inactiveSince,
            requestedPlan:
              data.requestedPlan === "starter" ||
              data.requestedPlan === "pro" ||
              data.requestedPlan === "business"
                ? data.requestedPlan
                : undefined,
            planRequestType: normalizeRequestType(
              data.planRequestType
            ),
            planRequestStatus: normalizeRequestStatus(
              data.planRequestStatus
            ),
            requestedPlanAt: data.requestedPlanAt,
            maxEvents:
              typeof data.maxEvents === "number"
                ? data.maxEvents
                : undefined,
            maxProducts:
              typeof data.maxProducts === "number"
                ? data.maxProducts
                : undefined,
          };
        }
      );

      normalizedUsers.sort((a, b) => {
        const score = (user: UserRow) => {
          if (user.planRequestStatus === "pending") return 0;
          if (user.subscriptionStatus === "active") return 1;
          if (user.subscriptionStatus === "past_due") return 2;
          if (user.suspended || !user.active) return 3;
          return 4;
        };

        return (
          score(a) - score(b) ||
          toMillisSafe(b.requestedPlanAt) -
            toMillisSafe(a.requestedPlanAt)
        );
      });

      setUsers(normalizedUsers);

      await Promise.all(
        expiredUpdates.map(({ uid, patch }) =>
          updateDoc(doc(db, "users", uid), patch)
        )
      );
    } catch (error) {
      console.error("[AdminSettings] loadUsers:", error);
      setErrMsg(
        tt(
          "admin.settings.msg.error",
          "Não foi possível carregar os usuários."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [tt]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    const filteredByTab = users.filter((user) => {
      if (filter === "pending") {
        return user.planRequestStatus === "pending";
      }

      if (filter === "active") {
        return (
          user.subscriptionStatus === "active" &&
          !user.suspended &&
          user.active
        );
      }

      if (filter === "suspended") {
        return (
          user.suspended ||
          !user.active ||
          user.subscriptionStatus === "past_due"
        );
      }

      return true;
    });

    if (!normalizedSearch) return filteredByTab;

    return filteredByTab.filter((user) => {
      const searchableText = [
        user.uid,
        user.email,
        user.displayName,
        user.plan,
        user.requestedPlan,
        user.subscriptionStatus,
        user.planRequestStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [filter, searchText, users]);

  const approvePlanRequest = useCallback(
    async (user: UserRow, days: number) => {
      const nextPlan = requestedPlanFor(user);
      const limits = PLAN_LIMITS[nextPlan];

      await patchUser(
        user.uid,
        {
          plan: nextPlan,
          subscriptionStatus: "active",
          active: true,
          suspended: false,
          inactiveSince: null,
          currentPeriodStart: serverTimestamp(),
          currentPeriodEnd: Timestamp.fromDate(addDays(days)),
          maxEvents: limits.maxEvents,
          maxProducts: limits.maxProducts,
          planRequestStatus: "approved",
          requestedPlan: null,
          planRequestType: null,
          requestedPlanAt: null,
        },
        tt(
          "admin.settings.msg.approved",
          "Plano aprovado por {days} dias."
        ).replace("{days}", String(days))
      );
    },
    [patchUser, tt]
  );

  const rejectPlanRequest = useCallback(
    async (user: UserRow) => {
      await patchUser(
        user.uid,
        {
          planRequestStatus: "rejected",
          requestedPlan: null,
          planRequestType: null,
          requestedPlanAt: null,
        },
        tt(
          "admin.settings.msg.rejected",
          "Solicitação rejeitada."
        )
      );
    },
    [patchUser, tt]
  );

  const renewCurrentPlan = useCallback(
    async (user: UserRow, days: number) => {
      const limits = PLAN_LIMITS[user.plan];

      await patchUser(
        user.uid,
        {
          subscriptionStatus: "active",
          active: true,
          suspended: false,
          inactiveSince: null,
          currentPeriodStart: serverTimestamp(),
          currentPeriodEnd: Timestamp.fromDate(addDays(days)),
          maxEvents: limits.maxEvents,
          maxProducts: limits.maxProducts,
        },
        tt(
          "admin.settings.msg.activated",
          "Plano ativado por {days} dias."
        ).replace("{days}", String(days))
      );
    },
    [patchUser, tt]
  );

  const cancelPlan = useCallback(
    async (user: UserRow) => {
      await patchUser(
        user.uid,
        {
          subscriptionStatus: "cancelled",
          active: false,
          inactiveSince: serverTimestamp(),
          planRequestStatus:
            user.planRequestStatus === "pending"
              ? "cancelled"
              : user.planRequestStatus ?? null,
          requestedPlan: null,
          planRequestType: null,
          requestedPlanAt: null,
        },
        tt(
          "admin.settings.msg.cancelled",
          "Plano cancelado."
        )
      );
    },
    [patchUser, tt]
  );

  const suspendUser = useCallback(
    async (user: UserRow) => {
      await patchUser(
        user.uid,
        {
          suspended: true,
          active: false,
          inactiveSince: serverTimestamp(),
        },
        tt(
          "admin.settings.msg.suspended",
          "Usuário suspenso."
        )
      );
    },
    [patchUser, tt]
  );

  const reactivateUser = useCallback(
    async (user: UserRow) => {
      await patchUser(
        user.uid,
        {
          suspended: false,
          active: true,
          inactiveSince: null,
        },
        tt(
          "admin.settings.msg.unsuspended",
          "Usuário reativado."
        )
      );
    },
    [patchUser, tt]
  );

  const applyPlanLimits = useCallback(
    async (user: UserRow, plan: PlanId) => {
      const limits = PLAN_LIMITS[plan];

      await patchUser(
        user.uid,
        {
          plan,
          maxEvents: limits.maxEvents,
          maxProducts: limits.maxProducts,
        },
        tt(
          "admin.settings.msg.limitsUpdated",
          "Plano e limites atualizados."
        )
      );
    },
    [patchUser, tt]
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-20">
      <header className="space-y-3">
        <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
          {tt(
            "admin.settings.title",
            "Assinaturas e usuários"
          )}
        </h1>

        <p className="text-sm text-neutral-500">
          {tt(
            "admin.settings.desc",
            "Aprove solicitações, gerencie vencimentos, limites e suspensões."
          )}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <TabPill
              label={tt(
                "admin.settings.tabs.pending",
                "Pendentes"
              )}
              active={filter === "pending"}
              onClick={() => setFilter("pending")}
            />
            <TabPill
              label={tt(
                "admin.settings.tabs.active",
                "Ativos"
              )}
              active={filter === "active"}
              onClick={() => setFilter("active")}
            />
            <TabPill
              label={tt(
                "admin.settings.tabs.suspended",
                "Suspensos"
              )}
              active={filter === "suspended"}
              onClick={() => setFilter("suspended")}
            />
            <TabPill
              label={tt("admin.settings.tabs.all", "Todos")}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
          </div>

          <input
            value={searchText}
            onChange={(event) =>
              setSearchText(event.target.value)
            }
            placeholder={tt(
              "admin.settings.search.placeholder",
              "Buscar usuário..."
            )}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-900 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white sm:w-72"
          />
        </div>
      </header>

      {(errMsg || okMsg) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            errMsg
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-200"
          }`}
        >
          {errMsg || okMsg}
        </div>
      )}

      {loading ? (
        <div className="h-28 animate-pulse rounded-3xl bg-neutral-100 dark:bg-neutral-900" />
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed py-20 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-500">
            {tt(
              "admin.sellers.none",
              "Nenhum usuário encontrado."
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredUsers.map((user) => {
            const remainingDays = daysLeft(
              user.currentPeriodEnd
            );
            const busy = busyUid === user.uid;
            const requestedPlan = requestedPlanFor(user);
            const requestType = inferredRequestType(user);

            return (
              <article
                key={user.uid}
                className="rounded-3xl border bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-black text-neutral-900 dark:text-white">
                        {user.displayName ||
                          tt(
                            "admin.settings.user.noName",
                            "Sem nome"
                          )}
                      </h3>

                      <span className="rounded-md border px-2 py-1 text-[10px] font-black text-neutral-600 dark:border-neutral-700 dark:text-neutral-200">
                        {user.role.toUpperCase()}
                      </span>

                      <StatusChip user={user} tt={tt} />
                    </div>

                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {user.email || "—"}
                    </p>

                    {user.planRequestStatus === "pending" && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                          {tt(
                            "admin.settings.request.title",
                            "Solicitação de plano"
                          )}
                        </p>

                        <p className="mt-1 text-sm font-black text-amber-900 dark:text-amber-200">
                          {user.plan} → {requestedPlan}
                        </p>

                        <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                          {tt(
                            `admin.settings.request.type.${requestType}`,
                            requestType
                          )}
                        </p>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                      <Info label="UID" value={user.uid} mono />

                      <Info
                        label={tt(
                          "admin.settings.info.plan",
                          "Plano atual"
                        )}
                        value={`${user.plan} / ${user.subscriptionStatus}`}
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.requestedPlan",
                          "Plano solicitado"
                        )}
                        value={
                          user.planRequestStatus === "pending"
                            ? requestedPlan
                            : "—"
                        }
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.requested",
                          "Solicitado em"
                        )}
                        value={fmtDate(
                          user.requestedPlanAt
                        )}
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.started",
                          "Início"
                        )}
                        value={fmtDate(
                          user.currentPeriodStart
                        )}
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.expires",
                          "Vencimento"
                        )}
                        value={fmtDate(
                          user.currentPeriodEnd
                        )}
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.daysLeft",
                          "Dias restantes"
                        )}
                        value={
                          remainingDays === null
                            ? "—"
                            : String(remainingDays)
                        }
                        tone={
                          remainingDays !== null &&
                          remainingDays <= 7
                            ? "warn"
                            : "neutral"
                        }
                      />

                      <Info
                        label={tt(
                          "admin.settings.info.limits",
                          "Limites"
                        )}
                        value={tt(
                          "admin.settings.info.limitsValue",
                          "{events} eventos / {products} produtos"
                        )
                          .replace(
                            "{events}",
                            String(user.maxEvents ?? "—")
                          )
                          .replace(
                            "{products}",
                            String(user.maxProducts ?? "—")
                          )}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:max-w-sm md:justify-end">
                    {user.planRequestStatus === "pending" ? (
                      <>
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void approvePlanRequest(user, 30)
                          }
                          tone="dark"
                        >
                          {tt(
                            "admin.settings.btn.approve30",
                            "Aprovar 30 dias"
                          )}
                        </ActionButton>

                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void approvePlanRequest(user, 7)
                          }
                        >
                          {tt(
                            "admin.settings.btn.approve7",
                            "Aprovar 7 dias"
                          )}
                        </ActionButton>

                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void rejectPlanRequest(user)
                          }
                          tone="danger"
                        >
                          {tt(
                            "admin.settings.btn.reject",
                            "Rejeitar"
                          )}
                        </ActionButton>
                      </>
                    ) : (
                      <>
                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void renewCurrentPlan(user, 30)
                          }
                          tone="dark"
                        >
                          {tt(
                            "admin.settings.btn.activate30",
                            "Ativar 30 dias"
                          )}
                        </ActionButton>

                        {user.suspended || !user.active ? (
                          <ActionButton
                            disabled={busy}
                            onClick={() =>
                              void reactivateUser(user)
                            }
                          >
                            {tt(
                              "admin.settings.btn.reactivate",
                              "Reativar"
                            )}
                          </ActionButton>
                        ) : (
                          <ActionButton
                            disabled={busy}
                            onClick={() =>
                              void suspendUser(user)
                            }
                            tone="danger"
                          >
                            {tt(
                              "admin.settings.btn.suspend",
                              "Suspender"
                            )}
                          </ActionButton>
                        )}

                        <ActionButton
                          disabled={busy}
                          onClick={() =>
                            void cancelPlan(user)
                          }
                        >
                          {tt(
                            "admin.settings.btn.cancelPlan",
                            "Cancelar plano"
                          )}
                        </ActionButton>
                      </>
                    )}

                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        void applyPlanLimits(
                          user,
                          "starter"
                        )
                      }
                    >
                      Starter
                    </ActionButton>

                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        void applyPlanLimits(user, "pro")
                      }
                    >
                      Pro
                    </ActionButton>

                    <ActionButton
                      disabled={busy}
                      onClick={() =>
                        void applyPlanLimits(
                          user,
                          "business"
                        )
                      }
                    >
                      Business
                    </ActionButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-5 py-2 text-xs font-black ${
        active
          ? "border-black bg-black text-white"
          : "bg-white text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function StatusChip({
  user,
  tt,
}: {
  user: UserRow;
  tt: (key: string, fallback: string) => string;
}) {
  const remaining = daysLeft(user.currentPeriodEnd);

  if (
    user.subscriptionStatus === "active" &&
    remaining !== null &&
    remaining <= 7 &&
    remaining >= 0
  ) {
    return (
      <span className="rounded-md bg-orange-500 px-2 py-1 text-[9px] font-black text-white">
        {tt(
          "admin.settings.status.expiring",
          "Vence em {days} dias"
        ).replace("{days}", String(remaining))}
      </span>
    );
  }

  const label =
    user.suspended || !user.active
      ? tt(
          "admin.settings.status.suspended",
          "Suspenso"
        )
      : user.planRequestStatus === "pending"
        ? tt(
            "admin.settings.status.pending",
            "Pendente"
          )
        : user.subscriptionStatus === "active"
          ? tt(
              "admin.settings.status.active",
              "Ativo"
            )
          : user.subscriptionStatus === "past_due"
            ? tt(
                "admin.settings.status.pastDue",
                "Vencido"
              )
            : user.subscriptionStatus === "cancelled"
              ? tt(
                  "admin.settings.status.cancelled",
                  "Cancelado"
                )
              : user.subscriptionStatus.toUpperCase();

  const className =
    user.suspended ||
    !user.active ||
    user.subscriptionStatus === "past_due"
      ? "bg-red-500"
      : user.planRequestStatus === "pending"
        ? "bg-amber-400 text-black"
        : user.subscriptionStatus === "active"
          ? "bg-emerald-500"
          : "bg-neutral-400";

  return (
    <span
      className={`rounded-md px-2 py-1 text-[9px] font-black text-white ${className}`}
    >
      {label}
    </span>
  );
}

function Info({
  label,
  value,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "warn";
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 ${
        tone === "warn"
          ? "border-orange-200 bg-orange-50 dark:border-orange-900/30 dark:bg-orange-950/10"
          : "bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40"
      }`}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
        {label}
      </div>

      <div
        className={`text-xs font-bold text-neutral-900 dark:text-white ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "dark" | "danger";
}) {
  const className =
    tone === "dark"
      ? "bg-black text-white hover:bg-neutral-800"
      : tone === "danger"
        ? "border border-red-200 text-red-600 dark:border-red-900/30 dark:text-red-200"
        : "border dark:border-neutral-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-4 py-2 text-xs font-black disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
