"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import AdminGuard from "@/app/_components/AdminGuard";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  collection,
  getDocs,
  where,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";
type PlanId = "starter" | "pro" | "business";

type UserRow = {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "seller" | "unknown";
  active: boolean;
  suspended: boolean;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  requestedPlanAt?: any;
  currentPeriodStart?: any;
  currentPeriodEnd?: any;
  inactiveSince?: any;
  maxEvents?: number;
  maxProducts?: number;
};

function toDateSafe(value: any): Date | null {
  if (!value) return null;

  try {
    if (typeof value?.toDate === "function") {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value === "string") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value?.seconds === "number") {
      const d = new Date(value.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  } catch {
    return null;
  }
}

function toMillisSafe(value: any): number {
  const d = toDateSafe(value);
  return d ? d.getTime() : 0;
}

function fmtDate(value?: any) {
  const d = toDateSafe(value);
  if (!d) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "Asia/Tokyo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function daysLeft(value?: any) {
  const d = toDateSafe(value);
  if (!d) return null;

  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeSubscriptionStatus(value: any): SubscriptionStatus {
  if (
    value === "pending" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled" ||
    value === "none"
  ) {
    return value;
  }

  return "none";
}

function normalizePlan(value: any): PlanId {
  if (value === "pro" || value === "business" || value === "starter") {
    return value;
  }

  return "starter";
}

function defaultLimits(plan: PlanId) {
  if (plan === "business") return { maxEvents: 10, maxProducts: 200 };
  if (plan === "pro") return { maxEvents: 3, maxProducts: 60 };
  return { maxEvents: 1, maxProducts: 20 };
}

export default function AdminSettingsPage() {
  return <AdminGuard>{() => <AdminSettingsInner />}</AdminGuard>;
}

function AdminSettingsInner() {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [qText, setQText] = useState("");
  const [filter, setFilter] = useState<"pending" | "all" | "active" | "suspended">("pending");
  const [busyUid, setBusyUid] = useState("");

  const patchUser = useCallback(
    async (uid: string, patch: Record<string, any>, success: string) => {
      setErrMsg("");
      setOkMsg("");
      setBusyUid(uid);

      try {
        await updateDoc(doc(db, "users", uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });

        setUsers((prev) =>
          prev.map((u) => (u.uid === uid ? ({ ...u, ...patch } as UserRow) : u))
        );

        setOkMsg(success);
        setTimeout(() => setOkMsg(""), 2500);
      } catch (e: any) {
        console.error(e);
        setErrMsg(e?.message || t("admin.settings.msg.updateError"));
      } finally {
        setBusyUid("");
      }
    },
    [t]
  );

  useEffect(() => {
    async function run() {
      setLoading(true);
      setErrMsg("");

      try {
        const qPending = query(
          collection(db, "users"),
          where("subscriptionStatus", "==", "pending"),
          orderBy("requestedPlanAt", "desc"),
          limit(300)
        );

        const qRecent = query(
          collection(db, "users"),
          orderBy("updatedAt", "desc"),
          limit(300)
        );

        const [pendingSnap, recentSnap] = await Promise.all([
          getDocs(qPending).catch(() => null),
          getDocs(qRecent).catch(() => null),
        ]);

        const byUid = new Map<string, any>();

        recentSnap?.docs.forEach((d) => byUid.set(d.id, d.data()));
        pendingSnap?.docs.forEach((d) => byUid.set(d.id, d.data()));

        const expiredPatches: Array<{ uid: string; patch: Record<string, any> }> = [];

        const list: UserRow[] = Array.from(byUid.entries()).map(([uid, data]) => {
          const subscriptionStatus = normalizeSubscriptionStatus(data.subscriptionStatus);
          const plan = normalizePlan(data.plan);
          const currentPeriodEnd = data.currentPeriodEnd;
          const currentPeriodEndMs = toMillisSafe(currentPeriodEnd);

          const isExpired =
            subscriptionStatus === "active" &&
            currentPeriodEndMs > 0 &&
            currentPeriodEndMs < Date.now();

          if (isExpired) {
            expiredPatches.push({
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
            email: String(data.email || ""),
            displayName: String(data.displayName || data.name || ""),
            role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : "unknown",
            active: isExpired ? false : data.active !== false,
            suspended: !!data.suspended,
            plan,
            subscriptionStatus: isExpired ? "past_due" : subscriptionStatus,
            requestedPlanAt: data.requestedPlanAt,
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd,
            inactiveSince: data.inactiveSince,
            maxEvents: typeof data.maxEvents === "number" ? data.maxEvents : undefined,
            maxProducts: typeof data.maxProducts === "number" ? data.maxProducts : undefined,
          };
        });

        list.sort((a, b) => {
          const score = (u: UserRow) =>
            u.subscriptionStatus === "pending"
              ? 0
              : u.subscriptionStatus === "active"
                ? 1
                : u.subscriptionStatus === "past_due"
                  ? 2
                  : u.suspended || !u.active
                    ? 3
                    : 4;

          return (
            score(a) - score(b) ||
            toMillisSafe(b.requestedPlanAt) - toMillisSafe(a.requestedPlanAt)
          );
        });

        setUsers(list);

        await Promise.all(
          expiredPatches.map((item) => updateDoc(doc(db, "users", item.uid), item.patch))
        );
      } catch (e) {
        console.error(e);
        setErrMsg(t("admin.settings.msg.error"));
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [t]);

  const filtered = useMemo(() => {
    const text = qText.trim().toLowerCase();

    const byTab = users.filter((u) => {
      if (filter === "pending") return u.subscriptionStatus === "pending";
      if (filter === "active") return u.subscriptionStatus === "active" && !u.suspended && u.active;
      if (filter === "suspended") {
        return u.suspended || !u.active || u.subscriptionStatus === "past_due";
      }

      return true;
    });

    if (!text) return byTab;

    return byTab.filter((u) => {
      const hay = `${u.uid} ${u.email} ${u.displayName} ${u.plan} ${u.subscriptionStatus}`.toLowerCase();
      return hay.includes(text);
    });
  }, [users, qText, filter]);

  const activatePlan = useCallback(
    (u: UserRow, days: number) => {
      const limits = defaultLimits(u.plan);

      patchUser(
        u.uid,
        {
          subscriptionStatus: "active",
          suspended: false,
          active: true,
          inactiveSince: null,
          currentPeriodStart: serverTimestamp(),
          currentPeriodEnd: Timestamp.fromDate(addDays(days)),
          maxEvents: u.maxEvents ?? limits.maxEvents,
          maxProducts: u.maxProducts ?? limits.maxProducts,
        },
        t("admin.settings.msg.activated").replace("{days}", String(days))
      );
    },
    [patchUser, t]
  );

  const setCancelled = useCallback(
    (u: UserRow) =>
      patchUser(
        u.uid,
        {
          subscriptionStatus: "cancelled",
          active: false,
          inactiveSince: serverTimestamp(),
        },
        t("admin.settings.msg.cancelled")
      ),
    [patchUser, t]
  );

  const suspend = useCallback(
    (u: UserRow) =>
      patchUser(
        u.uid,
        {
          suspended: true,
          active: false,
          inactiveSince: serverTimestamp(),
        },
        t("admin.settings.msg.suspended")
      ),
    [patchUser, t]
  );

  const unsuspend = useCallback(
    (u: UserRow) =>
      patchUser(
        u.uid,
        {
          suspended: false,
          active: true,
          inactiveSince: null,
        },
        t("admin.settings.msg.unsuspended")
      ),
    [patchUser, t]
  );

  const bumpLimits = useCallback(
    (u: UserRow, maxEvents: number, maxProducts: number) =>
      patchUser(
        u.uid,
        { maxEvents, maxProducts },
        t("admin.settings.msg.limitsUpdated")
      ),
    [patchUser, t]
  );

  return (
    <main className="max-w-6xl mx-auto p-4 pb-20 space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
          {t("admin.settings.title")}
        </h1>

        <p className="text-sm text-neutral-500">
          {t("admin.settings.desc")}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            <TabPill label={t("admin.settings.tabs.pending")} active={filter === "pending"} onClick={() => setFilter("pending")} />
            <TabPill label={t("admin.settings.tabs.active")} active={filter === "active"} onClick={() => setFilter("active")} />
            <TabPill label={t("admin.settings.tabs.suspended")} active={filter === "suspended"} onClick={() => setFilter("suspended")} />
            <TabPill label={t("admin.settings.tabs.all")} active={filter === "all"} onClick={() => setFilter("all")} />
          </div>

          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={t("admin.settings.search.placeholder")}
            className="w-full sm:w-72 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 text-xs font-bold text-neutral-900 dark:text-white outline-none"
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
        <div className="animate-pulse h-28 bg-neutral-100 dark:bg-neutral-900 rounded-3xl" />
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed rounded-3xl dark:border-neutral-800">
          <p className="text-neutral-500 text-sm">
            {t("admin.sellers.none")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((u) => {
            const remaining = daysLeft(u.currentPeriodEnd);
            const busy = busyUid === u.uid;

            return (
              <div
                key={u.uid}
                className="bg-white dark:bg-neutral-900 border dark:border-neutral-800 rounded-3xl p-5"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-neutral-900 dark:text-white truncate">
                        {u.displayName || t("admin.settings.user.noName")}
                      </h3>

                      <span className="text-[10px] font-black px-2 py-1 rounded-md border dark:border-neutral-700 text-neutral-600 dark:text-neutral-200">
                        {u.role.toUpperCase()}
                      </span>

                      <StatusChip u={u} t={t} />
                    </div>

                    <p className="text-xs text-neutral-500 truncate mt-1">
                      {u.email || "—"}
                    </p>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <Info label="UID" value={u.uid} mono />
                      <Info label={t("admin.settings.info.plan")} value={`${u.plan} / ${u.subscriptionStatus}`} />
                      <Info label={t("admin.settings.info.requested")} value={fmtDate(u.requestedPlanAt)} />
                      <Info label={t("admin.settings.info.started")} value={fmtDate(u.currentPeriodStart)} />
                      <Info label={t("admin.settings.info.expires")} value={fmtDate(u.currentPeriodEnd)} />
                      <Info
                        label={t("admin.settings.info.daysLeft")}
                        value={remaining === null ? "—" : String(remaining)}
                        tone={remaining !== null && remaining <= 7 ? "warn" : "neutral"}
                      />
                      <Info
                        label={t("admin.settings.info.limits")}
                        value={t("admin.settings.info.limitsValue")
                          .replace("{events}", String(u.maxEvents ?? "—"))
                          .replace("{products}", String(u.maxProducts ?? "—"))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {u.subscriptionStatus === "pending" ? (
                      <>
                        <ActionBtn disabled={busy} onClick={() => activatePlan(u, 30)} tone="dark">
                          {t("admin.settings.btn.activate30")}
                        </ActionBtn>

                        <ActionBtn disabled={busy} onClick={() => activatePlan(u, 7)}>
                          {t("admin.settings.btn.activate7")}
                        </ActionBtn>

                        <ActionBtn disabled={busy} onClick={() => setCancelled(u)} tone="danger">
                          {t("admin.settings.btn.cancel")}
                        </ActionBtn>
                      </>
                    ) : (
                      <>
                        {u.suspended || !u.active ? (
                          <ActionBtn disabled={busy} onClick={() => unsuspend(u)} tone="dark">
                            {t("admin.settings.btn.reactivate")}
                          </ActionBtn>
                        ) : (
                          <ActionBtn disabled={busy} onClick={() => suspend(u)} tone="danger">
                            {t("admin.settings.btn.suspend")}
                          </ActionBtn>
                        )}

                        <ActionBtn disabled={busy} onClick={() => setCancelled(u)}>
                          {t("admin.settings.btn.cancelPlan")}
                        </ActionBtn>
                      </>
                    )}

                    <ActionBtn disabled={busy} onClick={() => bumpLimits(u, 1, 20)}>
                      {t("admin.settings.btn.limitsStarter")}
                    </ActionBtn>

                    <ActionBtn disabled={busy} onClick={() => bumpLimits(u, 3, 60)}>
                      {t("admin.settings.btn.limitsPro")}
                    </ActionBtn>

                    <ActionBtn disabled={busy} onClick={() => bumpLimits(u, 10, 200)}>
                      {t("admin.settings.btn.limitsBusiness")}
                    </ActionBtn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-xs font-black border whitespace-nowrap ${
        active
          ? "bg-black text-white border-black"
          : "bg-white dark:bg-neutral-900 dark:text-white text-neutral-600 dark:border-neutral-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatusChip({ u, t }: { u: UserRow; t: (key: string) => string }) {
  const remaining = daysLeft(u.currentPeriodEnd);

  if (
    u.subscriptionStatus === "active" &&
    remaining !== null &&
    remaining <= 7 &&
    remaining >= 0
  ) {
    return (
      <span className="text-[9px] font-black px-2 py-1 rounded-md bg-orange-500 text-white">
        {t("admin.settings.status.expiring").replace("{days}", String(remaining))}
      </span>
    );
  }

  const label =
    u.suspended || !u.active
      ? t("admin.settings.status.suspended")
      : u.subscriptionStatus === "pending"
        ? t("admin.settings.status.pending")
        : u.subscriptionStatus === "active"
          ? t("admin.settings.status.active")
          : u.subscriptionStatus === "past_due"
            ? t("admin.settings.status.pastDue")
            : u.subscriptionStatus === "cancelled"
              ? t("admin.settings.status.cancelled")
              : u.subscriptionStatus.toUpperCase();

  const cls =
    u.suspended || !u.active || u.subscriptionStatus === "past_due"
      ? "bg-red-500"
      : u.subscriptionStatus === "pending"
        ? "bg-amber-400 text-black"
        : u.subscriptionStatus === "active"
          ? "bg-emerald-500"
          : "bg-neutral-400";

  return (
    <span className={`text-[9px] font-black px-2 py-1 rounded-md text-white ${cls}`}>
      {label}
    </span>
  );
}

function Info({
  label,
  value,
  mono,
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
          : "dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40"
      }`}
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div className={`text-xs font-bold text-neutral-900 dark:text-white ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "dark" | "danger";
}) {
  const cls =
    tone === "dark"
      ? "bg-black text-white hover:bg-neutral-800"
      : tone === "danger"
        ? "border text-red-600 border-red-200 dark:border-red-900/30 dark:text-red-200"
        : "border dark:border-neutral-700";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-2xl text-xs font-black disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}