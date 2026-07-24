"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  CalendarDays,
  CheckCircle2,
  Gift,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  addBillingPeriod,
  firestoreDateToDate,
  getEffectiveSellerAccess,
  normalizeAccountStatus,
  type AccountStatus,
  type AccessSource,
} from "@/app/lib/access-control";
import {
  formatMoneyMinor,
} from "@/app/lib/money";
import {
  getPlanLimits,
  normalizeBillingInterval,
  normalizePlanId,
  PLAN_IDS,
  type BillingInterval,
  type PlanId,
} from "@/app/lib/plan-catalog";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";
import type {
  OperatingCountry,
  SupportedCurrency,
} from "@/app/types/regional";

type SellerRow = {
  id: string;
  ownerUid: string;
  storeName: string;
  email: string;
  accountStatus: AccountStatus;
  country: OperatingCountry;
  currency: SupportedCurrency;
  regionalLocale: "ja-JP" | "pt-BR" | "en-US";
  access: ReturnType<typeof getEffectiveSellerAccess>;
};

type RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

type RequestRow = {
  id: string;
  sellerId: string;
  ownerUid: string;
  planId: PlanId;
  billingInterval: BillingInterval;
  requestType:
    | "new"
    | "renew"
    | "upgrade"
    | "downgrade";
  status: RequestStatus;
  country: OperatingCountry;
  currency: SupportedCurrency;
  amountMinor: number;
  createdAt: unknown;
  reference: DocumentReference<DocumentData>;
};

type Copy = {
  title: string;
  subtitle: string;
  refresh: string;
  pendingTitle: string;
  emptyPending: string;
  sellersTitle: string;
  loading: string;
  approve: string;
  reject: string;
  grantLifetime: string;
  revokeAccess: string;
  suspend: string;
  reactivate: string;
  account: string;
  access: string;
  request: string;
  notePrompt: string;
  confirmReject: string;
  confirmRevoke: string;
  success: string;
  error: string;
};

function requestSellerId(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): string {
  return snapshot.ref.parent.parent?.id ?? "";
}

function requireAdminUid(): string {
  const uid = auth.currentUser?.uid;

  if (!uid) {
    throw new Error("ADMIN_SESSION_REQUIRED");
  }

  return uid;
}

function dateLabel(
  value: unknown,
  locale: string,
): string {
  const date = firestoreDateToDate(value);

  if (!date) return "—";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeRequestStatus(value: unknown): RequestStatus {
  return value === "approved" ||
    value === "rejected" ||
    value === "cancelled"
    ? value
    : "pending";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="border-b border-neutral-200 px-5 py-4 text-lg font-black dark:border-neutral-800">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  secondary = false,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const style = danger
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
    : secondary
      ? "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      : "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`}
    >
      {children}
    </button>
  );
}

export default function PlanAccessAdminClient() {
  const { lang } = useI18n();

  const copy: Copy =
    lang === "ja"
      ? {
          title: "プランとアクセス",
          subtitle: "月額・年額申請、Lifetime、アカウント状態を管理します。",
          refresh: "更新",
          pendingTitle: "保留中の申請",
          emptyPending: "保留中の申請はありません。",
          sellersTitle: "販売者アクセス",
          loading: "読み込み中…",
          approve: "承認",
          reject: "却下",
          grantLifetime: "Lifetime付与",
          revokeAccess: "アクセス取消",
          suspend: "停止",
          reactivate: "再開",
          account: "アカウント",
          access: "アクセス",
          request: "申請",
          notePrompt: "メモ（任意）",
          confirmReject: "この申請を却下しますか？",
          confirmRevoke: "このアクセスを取り消しますか？",
          success: "更新しました。",
          error: "更新できませんでした。",
        }
      : lang === "en"
        ? {
            title: "Plans and access",
            subtitle: "Manage monthly and annual requests, Lifetime access, and account status.",
            refresh: "Refresh",
            pendingTitle: "Pending requests",
            emptyPending: "There are no pending requests.",
            sellersTitle: "Seller access",
            loading: "Loading…",
            approve: "Approve",
            reject: "Reject",
            grantLifetime: "Grant Lifetime",
            revokeAccess: "Revoke access",
            suspend: "Suspend",
            reactivate: "Reactivate",
            account: "Account",
            access: "Access",
            request: "Request",
            notePrompt: "Optional note",
            confirmReject: "Reject this request?",
            confirmRevoke: "Revoke this access?",
            success: "Updated successfully.",
            error: "The update failed.",
          }
        : {
            title: "Planos e acessos",
            subtitle: "Gerencie solicitações mensais e anuais, Lifetime e o status das contas.",
            refresh: "Atualizar",
            pendingTitle: "Solicitações pendentes",
            emptyPending: "Nenhuma solicitação pendente.",
            sellersTitle: "Acesso dos sellers",
            loading: "Carregando…",
            approve: "Aprovar",
            reject: "Rejeitar",
            grantLifetime: "Conceder Lifetime",
            revokeAccess: "Revogar acesso",
            suspend: "Suspender",
            reactivate: "Reativar",
            account: "Conta",
            access: "Acesso",
            request: "Solicitação",
            notePrompt: "Observação opcional",
            confirmReject: "Rejeitar esta solicitação?",
            confirmRevoke: "Revogar este acesso?",
            success: "Atualização concluída.",
            error: "Não foi possível concluir a atualização.",
          };

  const locale =
    lang === "ja"
      ? "ja-JP"
      : lang === "en"
        ? "en-US"
        : "pt-BR";

  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lifetimePlan, setLifetimePlan] = useState<Record<string, PlanId>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [sellerSnapshot, userSnapshot, requestSnapshot] = await Promise.all([
        getDocs(collection(db, "sellers")),
        getDocs(collection(db, "users")),
        getDocs(collectionGroup(db, "planRequests")),
      ]);

      const users = new Map<string, DocumentData>();
      userSnapshot.docs.forEach((snapshot) => {
        users.set(snapshot.id, snapshot.data());
      });

      const nextSellers: SellerRow[] = sellerSnapshot.docs.map((snapshot) => {
        const data = snapshot.data();
        const ownerUid = String(data.ownerUid ?? "").trim();
        const owner = users.get(ownerUid) ?? {};
        const regional = normalizeSellerRegionalProfile(data, {
          fallbackSellerId: snapshot.id,
        });

        const country = regional.operatingCountry ?? "JP";
        const currency = regional.currency ?? (country === "BR" ? "BRL" : country === "US" ? "USD" : "JPY");
        const regionalLocale = regional.regionalLocale ?? (country === "BR" ? "pt-BR" : country === "US" ? "en-US" : "ja-JP");

        return {
          id: snapshot.id,
          ownerUid,
          storeName: regional.storeName || snapshot.id,
          email: String(owner.email ?? ""),
          accountStatus: normalizeAccountStatus(data.accountStatus, {
            active: data.active,
            suspended: data.suspended,
          }),
          country,
          currency,
          regionalLocale,
          access: getEffectiveSellerAccess(data),
        };
      });

      nextSellers.sort((left, right) =>
        left.storeName.localeCompare(right.storeName, locale),
      );

      const nextRequests: RequestRow[] = requestSnapshot.docs
        .map((snapshot) => {
          const data = snapshot.data();
          const country: OperatingCountry =
            data.country === "BR" || data.country === "US" ? data.country : "JP";
          const currency: SupportedCurrency =
            data.currency === "BRL" || data.currency === "USD" ? data.currency : "JPY";

          return {
            id: snapshot.id,
            sellerId: requestSellerId(snapshot),
            ownerUid: String(data.ownerUid ?? ""),
            planId: normalizePlanId(data.planId),
            billingInterval: normalizeBillingInterval(data.billingInterval),
            requestType:
              data.requestType === "renew" ||
              data.requestType === "upgrade" ||
              data.requestType === "downgrade"
                ? data.requestType
                : "new",
            status: normalizeRequestStatus(data.status),
            country,
            currency,
            amountMinor: Number.isFinite(data.amountMinor)
              ? Number(data.amountMinor)
              : 0,
            createdAt: data.createdAt,
            reference: snapshot.ref,
          };
        })
        .sort((left, right) => {
          const rightDate = firestoreDateToDate(right.createdAt)?.getTime() ?? 0;
          const leftDate = firestoreDateToDate(left.createdAt)?.getTime() ?? 0;
          return rightDate - leftDate;
        });

      setSellers(nextSellers);
      setRequests(nextRequests);
      setLifetimePlan((current) => {
        const next = { ...current };
        nextSellers.forEach((seller) => {
          next[seller.id] = next[seller.id] ?? seller.access.planId;
        });
        return next;
      });
    } catch (loadError: unknown) {
      console.error("[PlanAccessAdmin] load:", loadError);
      setError(loadError instanceof Error ? loadError.message : copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );

  const perform = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setError("");
      setMessage("");

      try {
        await action();
        setMessage(copy.success);
        await load();
      } catch (actionError: unknown) {
        console.error("[PlanAccessAdmin] action:", actionError);
        setError(actionError instanceof Error ? actionError.message : copy.error);
      } finally {
        setBusyKey("");
      }
    },
    [copy.error, copy.success, load],
  );

  const approveRequest = useCallback(
    async (request: RequestRow) => {
      const adminUid = requireAdminUid();
      const now = Timestamp.now();
      const periodEnd = Timestamp.fromDate(
        addBillingPeriod(request.billingInterval, now.toDate()),
      );
      const batch = writeBatch(db);

      batch.update(doc(db, "sellers", request.sellerId), {
        accountStatus: "active",
        access: {
          planId: request.planId,
          mode: "subscription",
          billingInterval: request.billingInterval,
          status: "active",
          source: "purchase",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          grantedAt: serverTimestamp(),
          grantedBy: adminUid,
          note: null,
        },
        limitsOverride: null,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      batch.update(request.reference, {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid,
        reviewNote: null,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      await batch.commit();
    },
    [],
  );

  const rejectRequest = useCallback(
    async (request: RequestRow) => {
      if (!window.confirm(copy.confirmReject)) return;

      const adminUid = requireAdminUid();
      const note = window.prompt(copy.notePrompt) ?? "";
      const batch = writeBatch(db);

      batch.update(request.reference, {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid,
        reviewNote: note.trim() || null,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      await batch.commit();
    },
    [copy.confirmReject, copy.notePrompt],
  );

  const grantLifetime = useCallback(
    async (seller: SellerRow) => {
      const adminUid = requireAdminUid();
      const planId = lifetimePlan[seller.id] ?? seller.access.planId;
      const note = window.prompt(copy.notePrompt) ?? "";
      const source: AccessSource = "gift";

      const batch = writeBatch(db);
      batch.update(doc(db, "sellers", seller.id), {
        accountStatus: "active",
        access: {
          planId,
          mode: "lifetime",
          billingInterval: null,
          status: "active",
          source,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          grantedAt: serverTimestamp(),
          grantedBy: adminUid,
          note: note.trim() || "Lifetime concedido pelo administrador",
        },
        limitsOverride: null,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      await batch.commit();
    },
    [copy.notePrompt, lifetimePlan],
  );

  const revokeAccess = useCallback(
    async (seller: SellerRow) => {
      if (!window.confirm(copy.confirmRevoke)) return;

      const adminUid = requireAdminUid();
      const batch = writeBatch(db);
      batch.update(doc(db, "sellers", seller.id), {
        access: {
          ...seller.access,
          status: "revoked",
          currentPeriodEnd: null,
          grantedBy: adminUid,
          note: "Acesso revogado pelo administrador",
        },
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      await batch.commit();
    },
    [copy.confirmRevoke],
  );

  const changeAccountStatus = useCallback(
    async (seller: SellerRow, status: AccountStatus) => {
      const adminUid = requireAdminUid();
      const batch = writeBatch(db);

      batch.update(doc(db, "sellers", seller.id), {
        accountStatus: status,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });

      if (seller.ownerUid) {
        batch.update(doc(db, "users", seller.ownerUid), {
          accountStatus: status,
          updatedAt: serverTimestamp(),
          updatedBy: adminUid,
        });
      }

      await batch.commit();
    },
    [],
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm font-medium text-neutral-500">{copy.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || Boolean(busyKey)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-300 px-4 text-sm font-black dark:border-neutral-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {copy.refresh}
        </button>
      </header>

      {(error || message) && (
        <p
          role="status"
          className={`rounded-2xl border p-4 text-sm font-bold ${
            error
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
              : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300"
          }`}
        >
          {error || message}
        </p>
      )}

      <Section title={`${copy.pendingTitle} (${pendingRequests.length})`}>
        {loading ? (
          <p className="p-6 text-sm font-medium text-neutral-500">{copy.loading}</p>
        ) : pendingRequests.length === 0 ? (
          <p className="p-6 text-sm font-medium text-neutral-500">{copy.emptyPending}</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {pendingRequests.map((request) => {
              const seller = sellers.find((item) => item.id === request.sellerId);
              const key = `request:${request.sellerId}:${request.id}`;

              return (
                <article
                  key={key}
                  className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-black">
                      {seller?.storeName || request.sellerId}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-neutral-500">
                      {request.planId.toUpperCase()} · {request.billingInterval} · {request.requestType}
                    </p>
                    <p className="mt-2 text-sm font-black">
                      {formatMoneyMinor(
                        request.amountMinor,
                        request.currency,
                        seller?.regionalLocale ?? locale,
                      )}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {dateLabel(request.createdAt, locale)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      disabled={Boolean(busyKey)}
                      onClick={() =>
                        void perform(`${key}:approve`, () => approveRequest(request))
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {copy.approve}
                    </ActionButton>
                    <ActionButton
                      danger
                      disabled={Boolean(busyKey)}
                      onClick={() =>
                        void perform(`${key}:reject`, () => rejectRequest(request))
                      }
                    >
                      <XCircle className="h-4 w-4" />
                      {copy.reject}
                    </ActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`${copy.sellersTitle} (${sellers.length})`}>
        {loading ? (
          <p className="p-6 text-sm font-medium text-neutral-500">{copy.loading}</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {sellers.map((seller) => {
              const key = `seller:${seller.id}`;
              const activeLifetime =
                seller.access.mode === "lifetime" && seller.access.status === "active";

              return (
                <article key={seller.id} className="space-y-4 p-5">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black">{seller.storeName}</p>
                      <p className="truncate text-xs font-semibold text-neutral-500">
                        {seller.email || seller.ownerUid || seller.id}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide">
                        <span className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-900">
                          {copy.account}: {seller.accountStatus}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-900">
                          {copy.access}: {seller.access.planId} · {seller.access.mode === "lifetime" ? "lifetime" : seller.access.billingInterval} · {seller.access.status}
                        </span>
                        {seller.access.mode === "subscription" &&
                        seller.access.currentPeriodEnd != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-900">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {dateLabel(seller.access.currentPeriodEnd, locale)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={lifetimePlan[seller.id] ?? seller.access.planId}
                        onChange={(event) =>
                          setLifetimePlan((current) => ({
                            ...current,
                            [seller.id]: normalizePlanId(event.target.value),
                          }))
                        }
                        className="min-h-10 rounded-xl border border-neutral-300 bg-white px-3 text-xs font-black dark:border-neutral-700 dark:bg-neutral-900"
                        aria-label="Lifetime plan"
                      >
                        {PLAN_IDS.map((planId) => (
                          <option key={planId} value={planId}>
                            {planId.toUpperCase()} · {getPlanLimits(planId).maxEvents}/{getPlanLimits(planId).maxProducts}
                          </option>
                        ))}
                      </select>

                      <ActionButton
                        disabled={Boolean(busyKey)}
                        onClick={() =>
                          void perform(`${key}:lifetime`, () => grantLifetime(seller))
                        }
                      >
                        <Gift className="h-4 w-4" />
                        {copy.grantLifetime}
                      </ActionButton>

                      {(seller.access.status === "active" || activeLifetime) && (
                        <ActionButton
                          danger
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            void perform(`${key}:revoke`, () => revokeAccess(seller))
                          }
                        >
                          <ShieldAlert className="h-4 w-4" />
                          {copy.revokeAccess}
                        </ActionButton>
                      )}

                      <ActionButton
                        secondary
                        disabled={Boolean(busyKey)}
                        onClick={() =>
                          void perform(
                            `${key}:account`,
                            () =>
                              changeAccountStatus(
                                seller,
                                seller.accountStatus === "active" ? "suspended" : "active",
                              ),
                          )
                        }
                      >
                        {seller.accountStatus === "active" ? copy.suspend : copy.reactivate}
                      </ActionButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </main>
  );
}