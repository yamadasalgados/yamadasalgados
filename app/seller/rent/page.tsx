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
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import {
  Check,
  CreditCard,
  Globe2,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
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
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

type PlanRequestType =
  | "new"
  | "renew"
  | "upgrade"
  | "downgrade";

type CommercialProfile = {
  sellerId: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  requestedPlan?: PlanId;
  planRequestStatus?: string;
  active: boolean;
  suspended: boolean;
  operatingCountry: OperatingCountry;
  currency: SupportedCurrency;
  regionalLocale: RegionalLocale;
};

function normalizeStatus(
  value: unknown,
): SubscriptionStatus {
  switch (value) {
    case "pending":
    case "active":
    case "past_due":
    case "cancelled":
    case "none":
      return value;

    default:
      return "none";
  }
}

function normalizePlan(
  value: unknown,
): PlanId {
  return value === "pro" ||
    value === "business"
    ? value
    : "starter";
}

function optionalPlan(
  value: unknown,
): PlanId | undefined {
  return value === "starter" ||
    value === "pro" ||
    value === "business"
    ? value
    : undefined;
}

function requestTypeFor(
  current: PlanId,
  requested: PlanId,
): PlanRequestType {
  if (current === requested) {
    return "renew";
  }

  const rank: Record<PlanId, number> = {
    starter: 1,
    pro: 2,
    business: 3,
  };

  return rank[requested] > rank[current]
    ? "upgrade"
    : "downgrade";
}

function paymentMethods(
  country: OperatingCountry,
  language: "pt" | "en" | "ja",
): string {
  const values = {
    JP: {
      pt: "PayPay ou transferência bancária",
      en: "PayPay or bank transfer",
      ja: "PayPay または銀行振込",
    },
    BR: {
      pt: "Pix ou transferência bancária",
      en: "Pix or bank transfer",
      ja: "Pix または銀行振込",
    },
    US: {
      pt: "Transferência bancária ou método combinado com o suporte",
      en: "Bank transfer or another method arranged with support",
      ja: "銀行振込またはサポートと相談した方法",
    },
  } as const;

  return values[country][language];
}

function buildCommercialProfile(
  userData: DocumentData,
  sellerData: DocumentData,
): CommercialProfile | null {
  const sellerId = String(
    sellerData.sellerId ??
      userData.sellerId ??
      "",
  ).trim();

  const regional =
    normalizeSellerRegionalProfile(
      sellerData,
      {
        fallbackSellerId: sellerId,
        fallbackLanguage:
          userData.locale === "en" ||
          userData.locale === "ja"
            ? userData.locale
            : "pt",
      },
    );

  if (
    !regional.onboardingComplete ||
    !regional.operatingCountry ||
    !regional.currency ||
    !regional.regionalLocale
  ) {
    return null;
  }

  return {
    sellerId,
    // Compatibilidade: o admin atual ainda grava assinatura em users/{uid}.
    plan: normalizePlan(
      userData.plan ?? sellerData.plan,
    ),
    subscriptionStatus:
      normalizeStatus(
        userData.subscriptionStatus ??
          sellerData.subscriptionStatus,
      ),
    requestedPlan: optionalPlan(
      sellerData.requestedPlan ??
        userData.requestedPlan,
    ),
    planRequestStatus:
      typeof (
        sellerData.planRequestStatus ??
        userData.planRequestStatus
      ) === "string"
        ? String(
            sellerData.planRequestStatus ??
              userData.planRequestStatus,
          )
        : undefined,
    active:
      sellerData.active !== false &&
      userData.active !== false,
    suspended:
      sellerData.suspended === true ||
      userData.suspended === true,
    operatingCountry:
      regional.operatingCountry,
    currency: regional.currency,
    regionalLocale:
      regional.regionalLocale,
  };
}

export default function RentPage() {
  const router = useRouter();
  const {
    t,
    lang,
  } = useI18n();

  const tt = useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value === key
        ? fallback
        : value;
    },
    [t],
  );

  const [checking, setChecking] =
    useState(true);
  const [user, setUser] =
    useState<User | null>(null);
  const [profile, setProfile] =
    useState<CommercialProfile | null>(
      null,
    );
  const [busy, setBusy] =
    useState(false);
  const [message, setMessage] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [confirmPlanId, setConfirmPlanId] =
    useState<PlanId | null>(null);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (currentUser) => {
          if (!currentUser) {
            router.replace("/login");
            return;
          }

          setUser(currentUser);

          try {
            const ensured =
              await ensureUserProfile(
                currentUser,
                lang,
              );

            if (
              ensured.userDoc.role ===
              "admin"
            ) {
              router.replace("/admin");
              return;
            }

            const commercial =
              buildCommercialProfile(
                ensured.userDoc,
                ensured.sellerDoc ?? {},
              );

            if (!commercial) {
              router.replace(
                "/seller/onboarding",
              );
              return;
            }

            setProfile(commercial);

          } catch (loadError: any) {
            console.error(
              "[Rent] Falha ao carregar:",
              loadError,
            );
            setError(
              loadError?.message ||
                tt(
                  "guard.err.loadProfile",
                  "Erro ao carregar perfil.",
                ),
            );
          } finally {
            setChecking(false);
          }
        },
      );

    return () => unsubscribe();
  }, [lang, router, tt]);

  const plans = useMemo(() => {
    if (!profile) return [];

    return PLAN_IDS.map((planId) => {
      const definition =
        getPlanDefinition(planId);
      const regionalPrice =
        getPlanPrice(
          planId,
          profile.operatingCountry,
        );

      return {
        id: planId,
        name: tt(
          `plan.${planId}.name`,
          planId,
        ),
        price: formatMoneyMinor(
          regionalPrice.amountMinor,
          regionalPrice.currency,
          profile.regionalLocale,
        ),
        features: (
          tt(
            `plan.${planId}.features`,
            "",
          ) || ""
        )
          .split("\n")
          .map((feature) =>
            feature.replace(/^•\s*/, "").trim(),
          )
          .filter(Boolean),
        limits: definition.limits,
        regionalPrice,
      };
    });
  }, [profile, tt]);

  const requestPlan = useCallback(
    async (planId: PlanId) => {
      if (!user || !profile) return;

      const selected = plans.find(
        (plan) => plan.id === planId,
      );

      if (!selected) return;

      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        const requestType =
          profile.subscriptionStatus ===
            "none" &&
          !profile.requestedPlan
            ? "new"
            : requestTypeFor(
                profile.plan,
                planId,
              );

        const requestedAt =
          serverTimestamp();

        const requestSnapshot = {
          requestedPlan: planId,
          planRequestType: requestType,
          planRequestStatus: "pending",
          requestedPlanAt: requestedAt,

          requestedCountry:
            selected.regionalPrice.country,
          requestedCurrency:
            selected.regionalPrice.currency,
          requestedAmountMinor:
            selected.regionalPrice.amountMinor,

          requestedLimits: {
            ...selected.limits,
          },
          updatedAt: requestedAt,
          updatedBy: user.uid,
        };

        const batch = writeBatch(db);

        batch.set(
          doc(
            db,
            "sellers",
            profile.sellerId,
          ),
          requestSnapshot,
          {
            merge: true,
          },
        );

        // Espelho temporário para o admin legado.
        batch.set(
          doc(db, "users", user.uid),
          requestSnapshot,
          {
            merge: true,
          },
        );

        await batch.commit();

        setProfile((current) =>
          current
            ? {
                ...current,
                requestedPlan: planId,
                planRequestStatus:
                  "pending",
              }
            : current,
        );

        setMessage(
          tt(
            "rent.requested",
            "Solicitação enviada! Aguarde a ativação.",
          ),
        );
      } catch (requestError: any) {
        console.error(
          "[Rent] Falha ao solicitar plano:",
          requestError,
        );
        setError(
          requestError?.message ||
            tt(
              "settings.err.save",
              "Falha ao solicitar plano.",
            ),
        );
      } finally {
        setBusy(false);
      }
    }, [plans, profile, tt, user]);

  if (checking || !profile) {
    return (
      <main className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </main>
    );
  }

  const countryDefinition =
    getCountryDefinition(
      profile.operatingCountry,
    );

  return (
    <main className="min-h-screen bg-neutral-50 pb-20 transition-colors dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl space-y-8 px-4 pt-8 sm:px-6">
        <header className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            <Globe2
              className="h-4 w-4"
              aria-hidden="true"
            />
            {countryDefinition.label[lang]}
            <span className="text-neutral-400">·</span>
            {profile.currency}
          </div>

          <div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
              {tt(
                "rent.title",
                "Planos de acesso",
              )}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {tt(
                "rent.subtitle",
                "Selecione a assinatura ideal para expandir suas vendas e gerenciar seus pedidos.",
              )}
            </p>
          </div>
        </header>

        {(message || error) && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3.5 text-sm font-bold ${
              error
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400"
                : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-400"
            }`}
          >
            {error ?? message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent =
              profile.plan === plan.id;
            const isPending =
              profile.planRequestStatus ===
                "pending" &&
              profile.requestedPlan ===
                plan.id;

            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-[2rem] border p-6 transition ${
                  isCurrent
                    ? "border-black bg-neutral-950 text-white shadow-xl dark:border-white"
                    : "border-neutral-200 bg-white text-neutral-900 shadow-sm hover:-translate-y-1 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
                }`}
              >
                {isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1.5 text-xs font-black text-black shadow">
                    {tt(
                      "rent.status.pending",
                      "Pendente",
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <h2 className="text-sm font-black uppercase tracking-wider opacity-60">
                    {plan.name}
                  </h2>
                  <p className="text-4xl font-black tracking-tight">
                    {plan.price}
                  </p>
                  <p className="text-xs font-semibold opacity-60">
                    {t("rent.price.month")}
                  </p>
                </div>

                <ul className="my-6 flex-1 space-y-3 border-t border-current/10 pt-5">
                  {plan.features.map(
                    (feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm font-semibold"
                      >
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ),
                  )}
                </ul>

                <button
                  type="button"
                  disabled={busy || isPending}
                  onClick={() =>
                    setConfirmPlanId(plan.id)
                  }
                  className={`min-h-12 w-full rounded-2xl px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isCurrent
                      ? "bg-white text-black hover:bg-neutral-100"
                      : "bg-black text-white hover:opacity-85 dark:bg-white dark:text-black"
                  }`}
                >
                  {isPending
                    ? tt(
                        "rent.requested",
                        "Solicitado",
                      )
                    : isCurrent
                      ? tt(
                          "rent.currentPlan",
                          "Plano atual",
                        )
                      : tt(
                          "rent.requestPlan",
                          "Escolher este",
                        )}
                </button>
              </article>
            );
          })}
        </div>

        <section className="grid gap-5 rounded-[2rem] border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/30 dark:bg-amber-950/20 md:grid-cols-[auto_1fr]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-black">
            <CreditCard
              className="h-6 w-6"
              aria-hidden="true"
            />
          </span>

          <div>
            <h2 className="text-sm font-black text-amber-950 dark:text-amber-200">
              {tt(
                "rent.payment.title",
                "Formas de pagamento",
              )}
            </h2>
            <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              {paymentMethods(
                profile.operatingCountry,
                lang,
              )}
            </p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-amber-700 dark:text-amber-400">
              {tt(
                "rent.payment.note",
                "Após o pagamento, o admin ativa seu plano e libera o acesso ao painel.",
              )}
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 dark:border-red-900/30 dark:bg-red-950/10">
          <h2 className="text-sm font-black text-red-900 dark:text-red-300">
            {tt(
              "rent.dataPolicy.title",
              "Política de dados e inatividade",
            )}
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-red-800 dark:text-red-300">
            {tt(
              "rent.dataPolicy.body",
              "Contas sem assinatura ativa por mais de 30 dias poderão ser excluídas permanentemente.",
            )}
          </p>
        </section>

        {confirmPlanId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-confirm-title"
          >
            <div className="w-full max-w-md space-y-5 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
              <div>
                <h2
                  id="plan-confirm-title"
                  className="text-xl font-black text-neutral-900 dark:text-white"
                >
                  {tt(
                    "rent.confirm.title",
                    "Confirmar solicitação",
                  )}
                </h2>

                <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {tt(
                    "rent.confirm.body",
                    "Confirme o plano e o preço regional apresentados.",
                  )}
                </p>
              </div>

              {(() => {
                const selected = plans.find(
                  (plan) =>
                    plan.id ===
                    confirmPlanId,
                );

                if (!selected) return null;

                return (
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950">
                    <p className="text-sm font-black text-neutral-900 dark:text-white">
                      {selected.name}
                    </p>
                    <p className="mt-1 text-2xl font-black text-neutral-950 dark:text-white">
                      {selected.price}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-neutral-500">
                      {countryDefinition.label[lang]} · {selected.regionalPrice.currency}
                    </p>
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setConfirmPlanId(null)
                  }
                  className="min-h-12 flex-1 rounded-2xl border border-neutral-200 text-sm font-black text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
                >
                  {t("common.cancel")}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const planId =
                      confirmPlanId;
                    setConfirmPlanId(null);
                    void requestPlan(planId);
                  }}
                  className="min-h-12 flex-1 rounded-2xl bg-black text-sm font-black text-white disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {busy
                    ? t("common.saving")
                    : tt(
                        "rent.confirm.accept",
                        "Confirmar",
                      )}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="pb-8 text-center text-xs font-bold text-neutral-400">
          Yamada Order System
        </footer>
      </div>
    </main>
  );
}
