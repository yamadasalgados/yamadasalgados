"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import {
  CalendarDays,
  Check,
  Crown,
  Gift,
  Loader2,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  accessIsActive,
  getEffectiveSellerAccess,
} from "@/app/lib/access-control";
import {
  ensureUserProfile,
} from "@/app/lib/ensureUserProfile";
import {
  formatMoneyMinor,
} from "@/app/lib/money";
import {
  getPlanDefinition,
  getPlanPrice,
  PLAN_IDS,
  type BillingInterval,
  type PlanId,
} from "@/app/lib/plan-catalog";
import {
  getCountryDefinition,
} from "@/app/lib/regional";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";
import type {
  OperatingCountry,
} from "@/app/types/regional";

type RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

type PlanRequest = {
  id: string;
  planId: PlanId;
  billingInterval: BillingInterval;
  status: RequestStatus;
  amountMinor: number;
  createdAt?: unknown;
};

const ORDER: Record<PlanId, number> = {
  starter: 1,
  pro: 2,
  business: 3,
};

function requestType(
  currentPlan: PlanId,
  requestedPlan: PlanId,
  currentStatus: string,
): "new" | "renew" | "upgrade" | "downgrade" {
  if (currentStatus !== "active") {
    return "new";
  }

  if (currentPlan === requestedPlan) {
    return "renew";
  }

  return ORDER[requestedPlan] >
    ORDER[currentPlan]
    ? "upgrade"
    : "downgrade";
}

export default function SellerRentPage() {
  const router = useRouter();
  const { lang } = useI18n();

  const [user, setUser] =
    useState<User | null>(null);
  const [sellerId, setSellerId] =
    useState("");
  const [seller, setSeller] =
    useState<DocumentData | null>(null);
  const [country, setCountry] =
    useState<OperatingCountry>("JP");
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("monthly");
  const [pending, setPending] =
    useState<PlanRequest | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [submitting, setSubmitting] =
    useState<PlanId | null>(null);
  const [error, setError] =
    useState("");
  const [success, setSuccess] =
    useState("");

  const copy =
    lang === "ja"
      ? {
          title: "プランを選択",
          subtitle: "月額または年額を選択できます。年額は2か月分お得です。",
          monthly: "月額",
          annual: "年額",
          annualBadge: "2か月無料",
          events: "イベント",
          products: "商品",
          choose: "申し込む",
          pending: "申請確認中",
          active: "現在のアクセス",
          lifetime: "Lifetimeアクセス",
          lifetimeBody: "有効期限なし。管理者のみ付与・取り消しできます。",
          loading: "プランを読み込んでいます…",
          success: "申請を送信しました。",
          error: "申請を送信できませんでした。",
          current: "現在",
          perMonth: "/月",
          perYear: "/年",
        }
      : lang === "en"
        ? {
            title: "Choose your plan",
            subtitle: "Choose monthly or annual. Annual includes two free months.",
            monthly: "Monthly",
            annual: "Annual",
            annualBadge: "2 months free",
            events: "events",
            products: "products",
            choose: "Request plan",
            pending: "Request under review",
            active: "Current access",
            lifetime: "Lifetime access",
            lifetimeBody: "No automatic expiration. Only an administrator can grant or revoke it.",
            loading: "Loading plans…",
            success: "Plan request submitted.",
            error: "We could not submit the request.",
            current: "Current",
            perMonth: "/month",
            perYear: "/year",
          }
        : {
            title: "Escolha seu plano",
            subtitle: "Escolha mensal ou anual. No anual, você recebe dois meses grátis.",
            monthly: "Mensal",
            annual: "Anual",
            annualBadge: "2 meses grátis",
            events: "eventos",
            products: "produtos",
            choose: "Solicitar plano",
            pending: "Solicitação em análise",
            active: "Acesso atual",
            lifetime: "Acesso Lifetime",
            lifetimeBody: "Sem vencimento automático. Somente o administrador pode conceder ou revogar.",
            loading: "Carregando planos…",
            success: "Solicitação enviada.",
            error: "Não foi possível enviar a solicitação.",
            current: "Atual",
            perMonth: "/mês",
            perYear: "/ano",
          };

  const loadPending = useCallback(
    async (resolvedSellerId: string) => {
      const snapshot =
        await getDocs(
          query(
            collection(
              db,
              "sellers",
              resolvedSellerId,
              "planRequests",
            ),
            orderBy(
              "createdAt",
              "desc",
            ),
            limit(1),
          ),
        );

      const document =
        snapshot.docs[0];

      if (!document) {
        setPending(null);
        return;
      }

      const data = document.data();

      setPending({
        id: document.id,
        planId:
          data.planId === "pro" ||
          data.planId === "business"
            ? data.planId
            : "starter",
        billingInterval:
          data.billingInterval === "annual"
            ? "annual"
            : "monthly",
        status:
          data.status === "approved" ||
          data.status === "rejected" ||
          data.status === "cancelled"
            ? data.status
            : "pending",
        amountMinor:
          Number.isFinite(
            data.amountMinor,
          )
            ? Number(
                data.amountMinor,
              )
            : 0,
        createdAt:
          data.createdAt,
      });
    },
    [],
  );

  const load = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      setError("");

      try {
        const result =
          await ensureUserProfile(
            currentUser,
            lang,
          );

        if (
          result.userDoc.role ===
          "admin"
        ) {
          router.replace("/admin");
          return;
        }

        const resolvedSellerId =
          String(
            result.userDoc.sellerId ??
            currentUser.uid,
          ).trim();

        const regional =
          normalizeSellerRegionalProfile(
            result.sellerDoc,
            {
              fallbackSellerId:
                resolvedSellerId,
              fallbackLanguage: lang,
            },
          );

        if (
          !regional.onboardingComplete
        ) {
          router.replace(
            "/seller/onboarding",
          );
          return;
        }

        if (
          accessIsActive(
            result.sellerDoc,
            result.userDoc,
          )
        ) {
          // Lifetime ou assinatura válida pode continuar vendo
          // a página somente pelo redirecionamento do guard.
        }

        setUser(currentUser);
        setSellerId(
          resolvedSellerId,
        );
        setSeller(
          result.sellerDoc,
        );
        setCountry(
          regional.operatingCountry ??
          "JP",
        );

        await loadPending(
          resolvedSellerId,
        );
      } catch (loadError: unknown) {
        console.error(
          "[Rent] load:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : copy.error,
        );
      } finally {
        setLoading(false);
      }
    },
    [
      copy.error,
      lang,
      loadPending,
      router,
    ],
  );

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          if (!currentUser) {
            router.replace("/login");
            return;
          }

          void load(currentUser);
        },
      );

    return () => unsubscribe();
  }, [load, router]);

  const access =
    useMemo(
      () =>
        getEffectiveSellerAccess(
          seller,
        ),
      [seller],
    );

  const locale =
    getCountryDefinition(
      country,
    ).regionalLocale;

  const submit = useCallback(
    async (planId: PlanId) => {
      if (
        !user ||
        !sellerId ||
        (
          access.mode === "lifetime" &&
          access.status === "active"
        )
      ) {
        return;
      }

      setSubmitting(planId);
      setError("");
      setSuccess("");

      try {
        const definition =
          getPlanDefinition(planId);
        const price =
          getPlanPrice(
            planId,
            country,
            billingInterval,
          );

        await addDoc(
          collection(
            db,
            "sellers",
            sellerId,
            "planRequests",
          ),
          {
            schemaVersion: 2,
            sellerId,
            ownerUid: user.uid,

            planId,
            billingInterval,
            requestType:
              requestType(
                access.planId,
                planId,
                access.status,
              ),
            status:
              "pending" as const,

            country:
              price.country,
            currency:
              price.currency,
            amountMinor:
              price.amountMinor,
            limitsSnapshot:
              definition.limits,

            createdAt:
              serverTimestamp(),
            createdBy:
              user.uid,
            updatedAt:
              serverTimestamp(),
            updatedBy:
              user.uid,

            reviewedAt: null,
            reviewedBy: null,
            reviewNote: null,
          },
        );

        setSuccess(copy.success);
        await loadPending(
          sellerId,
        );
      } catch (submitError: unknown) {
        console.error(
          "[Rent] submit:",
          submitError,
        );

        setError(
          submitError instanceof Error
            ? submitError.message
            : copy.error,
        );
      } finally {
        setSubmitting(null);
      }
    },
    [
      access.mode,
      access.planId,
      access.status,
      billingInterval,
      copy.error,
      copy.success,
      country,
      loadPending,
      sellerId,
      user,
    ],
  );

  if (loading) {
    return (
      <main className="flex min-h-[65vh] items-center justify-center">
        <p className="text-sm font-bold text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {copy.subtitle}
        </p>

        <div className="mx-auto mt-6 inline-flex rounded-2xl border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
          {(
            [
              "monthly",
              "annual",
            ] as BillingInterval[]
          ).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() =>
                setBillingInterval(
                  interval,
                )
              }
              className={`rounded-xl px-5 py-2.5 text-sm font-black transition ${
                billingInterval === interval
                  ? "bg-white text-black shadow dark:bg-white"
                  : "text-neutral-500"
              }`}
            >
              {interval === "annual"
                ? copy.annual
                : copy.monthly}
              {interval === "annual" && (
                <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
                  {copy.annualBadge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {access.mode === "lifetime" &&
        access.status === "active" && (
          <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
            <div className="flex items-start gap-4">
              <Gift className="mt-1 h-6 w-6 text-violet-600" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-violet-600">
                  {copy.active}
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {copy.lifetime} · {access.planId.toUpperCase()}
                </h2>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  {copy.lifetimeBody}
                </p>
              </div>
            </div>
          </section>
        )}

      {pending?.status === "pending" && (
        <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          {copy.pending}:{" "}
          {pending.planId.toUpperCase()} ·{" "}
          {pending.billingInterval === "annual"
            ? copy.annual
            : copy.monthly} ·{" "}
          {formatMoneyMinor(
            pending.amountMinor,
            getPlanPrice(
              pending.planId,
              country,
              pending.billingInterval,
            ).currency,
            locale,
          )}
        </section>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {PLAN_IDS.map((planId) => {
          const definition =
            getPlanDefinition(planId);
          const price =
            getPlanPrice(
              planId,
              country,
              billingInterval,
            );
          const current =
            access.planId === planId &&
            access.status === "active";

          return (
            <article
              key={planId}
              className={`relative rounded-[2rem] border bg-white p-6 shadow-sm dark:bg-neutral-950 ${
                planId === "pro"
                  ? "border-orange-400 ring-4 ring-orange-500/10"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {planId === "business" && (
                <Crown className="absolute right-5 top-5 h-5 w-5 text-amber-500" />
              )}

              <h2 className="text-2xl font-black capitalize">
                {planId}
              </h2>

              <p className="mt-5 text-3xl font-black">
                {formatMoneyMinor(
                  price.amountMinor,
                  price.currency,
                  locale,
                )}
                <span className="ml-1 text-xs font-bold text-neutral-400">
                  {billingInterval === "annual"
                    ? copy.perYear
                    : copy.perMonth}
                </span>
              </p>

              <ul className="mt-6 space-y-3 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  {definition.limits.maxEvents} {copy.events}
                </li>
                <li className="flex gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  {definition.limits.maxProducts} {copy.products}
                </li>
                <li className="flex gap-2">
                  <CalendarDays className="h-4 w-4 text-green-600" />
                  {billingInterval === "annual"
                    ? copy.annualBadge
                    : copy.monthly}
                </li>
              </ul>

              <button
                type="button"
                onClick={() =>
                  void submit(planId)
                }
                disabled={
                  submitting !== null ||
                  pending?.status ===
                    "pending" ||
                  (
                    access.mode === "lifetime" &&
                    access.status === "active"
                  )
                }
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {submitting === planId
                  ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )
                  : current
                    ? copy.current
                    : copy.choose}
              </button>
            </article>
          );
        })}
      </div>

      {(error || success) && (
        <p className={`mx-auto mt-6 max-w-3xl rounded-2xl border p-4 text-sm font-bold ${
          error
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-green-200 bg-green-50 text-green-700"
        }`}>
          {error || success}
        </p>
      )}
    </main>
  );
}
