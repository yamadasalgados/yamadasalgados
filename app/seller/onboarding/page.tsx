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
  Building2,
  Check,
  Clock3,
  Globe2,
  Languages,
  MapPin,
  type LucideIcon,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  ensureUserProfile,
  type EnsureResult,
} from "@/app/lib/ensureUserProfile";
import {
  COUNTRY_DEFINITIONS,
  countryFromTimeZone,
  detectBrowserTimeZone,
  getCountryDefinition,
  getRegionalSettings,
  getTimeZoneLabel,
  isAllowedTimeZone,
} from "@/app/lib/regional";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";
import type {
  OperatingCountry,
  SupportedLanguage,
} from "@/app/types/regional";

function text(
  value: unknown,
): string {
  return String(value ?? "").trim();
}

function hasActivePlan(
  seller: DocumentData | null,
  user: DocumentData,
): boolean {
  const subscriptionStatus =
    user.subscriptionStatus ??
    seller?.subscriptionStatus;

  if (
    subscriptionStatus !== "active" ||
    user.suspended === true ||
    seller?.suspended === true ||
    user.active === false ||
    seller?.active === false
  ) {
    return false;
  }

  const periodEnd =
    user.currentPeriodEnd ??
    seller?.currentPeriodEnd;

  if (!periodEnd) return true;

  if (
    typeof periodEnd === "object" &&
    periodEnd !== null &&
    "toDate" in periodEnd &&
    typeof (
      periodEnd as {
        toDate?: unknown;
      }
    ).toDate === "function"
  ) {
    const date = (
      periodEnd as {
        toDate: () => Date;
      }
    ).toDate();

    return date.getTime() > Date.now();
  }

  return false;
}

export default function SellerOnboardingPage() {
  const router = useRouter();
  const {
    t,
    lang,
    setLang,
  } = useI18n();

  const [user, setUser] =
    useState<User | null>(null);
  const [result, setResult] =
    useState<EnsureResult | null>(null);
  const [sellerId, setSellerId] =
    useState("");
  const [storeName, setStoreName] =
    useState("");
  const [country, setCountry] =
    useState<OperatingCountry>("JP");
  const [timeZone, setTimeZone] =
    useState("Asia/Tokyo");
  const [preferredLanguage, setPreferredLanguage] =
    useState<SupportedLanguage>(lang);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      setError("");

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

        const resolvedSellerId =
          text(
            ensured.userDoc.sellerId,
          ) || currentUser.uid;

        const regional =
          normalizeSellerRegionalProfile(
            ensured.sellerDoc,
            {
              fallbackSellerId:
                resolvedSellerId,
              fallbackLanguage: lang,
            },
          );

        if (
          regional.onboardingComplete
        ) {
          router.replace(
            hasActivePlan(
              ensured.sellerDoc,
              ensured.userDoc,
            )
              ? "/seller"
              : "/seller/rent",
          );
          return;
        }

        const browserTimeZone =
          detectBrowserTimeZone();

        const detectedCountry =
          countryFromTimeZone(
            browserTimeZone,
          );

        const initialCountry =
          regional.operatingCountry ??
          detectedCountry ??
          "JP";

        const initialTimeZone =
          regional.timeZone ||
          (
            isAllowedTimeZone(
              initialCountry,
              browserTimeZone,
            )
              ? browserTimeZone
              : getCountryDefinition(
                  initialCountry,
                ).defaultTimeZone
          );

        setUser(currentUser);
        setResult(ensured);
        setSellerId(
          resolvedSellerId,
        );
        setStoreName(
          regional.storeName ||
            text(
              ensured.sellerDoc
                ?.ownerName,
            ) ||
            text(
              ensured.userDoc
                .displayName,
            ) ||
            text(
              currentUser.displayName,
            ),
        );
        setCountry(initialCountry);
        setTimeZone(initialTimeZone);
        setPreferredLanguage(
          regional.defaultLanguage ||
            lang,
        );
      } catch (loadError: any) {
        console.error(
          "[Onboarding] Falha ao carregar:",
          loadError,
        );
        setError(
          loadError?.message ||
            t("onboarding.error.load"),
        );
      } finally {
        setLoading(false);
      }
    },
    [lang, router, t],
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

  useEffect(() => {
    if (
      isAllowedTimeZone(
        country,
        timeZone,
      )
    ) {
      return;
    }

    setTimeZone(
      getCountryDefinition(country)
        .defaultTimeZone,
    );
  }, [country, timeZone]);

  const countryDefinition =
    useMemo(
      () => getCountryDefinition(country),
      [country],
    );

  const regional = useMemo(
    () =>
      getRegionalSettings(
        country,
        timeZone,
      ),
    [country, timeZone],
  );

  const handleSave =
    useCallback(async () => {
      if (
        !user ||
        !result ||
        !sellerId
      ) {
        return;
      }

      const normalizedStoreName =
        storeName.trim();

      if (!normalizedStoreName) {
        setError(
          t("onboarding.error.storeName"),
        );
        return;
      }

      setSaving(true);
      setError("");

      try {
        const selectedRegional =
          getRegionalSettings(
            country,
            timeZone,
          );

        const batch = writeBatch(db);
        const completedAt =
          serverTimestamp();

        batch.set(
          doc(
            db,
            "sellers",
            sellerId,
          ),
          {
            sellerId,
            ownerUid: user.uid,
            storeName:
              normalizedStoreName,
            defaultLanguage:
              preferredLanguage,

            operatingCountry:
              selectedRegional.operatingCountry,
            currency:
              selectedRegional.currency,
            regionalLocale:
              selectedRegional.regionalLocale,
            timeZone:
              selectedRegional.timeZone,
            regionalVersion: 1,

            onboardingComplete: true,
            onboardingCompletedAt:
              completedAt,
            updatedAt: completedAt,
            updatedBy: user.uid,
          },
          {
            merge: true,
          },
        );

        // Espelho temporário para páginas antigas.
        batch.set(
          doc(db, "users", user.uid),
          {
            sellerId,
            storeName:
              normalizedStoreName,
            locale:
              preferredLanguage,
            preferredLanguage,

            operatingCountry:
              selectedRegional.operatingCountry,
            currency:
              selectedRegional.currency,
            regionalLocale:
              selectedRegional.regionalLocale,
            timeZone:
              selectedRegional.timeZone,

            onboardingComplete: true,
            onboardingCompletedAt:
              completedAt,
            updatedAt: completedAt,
            updatedBy: user.uid,
          },
          {
            merge: true,
          },
        );

        await batch.commit();
        setLang(preferredLanguage);

        const destination =
          hasActivePlan(
            result.sellerDoc,
            result.userDoc,
          )
            ? "/seller"
            : "/seller/rent";

        // Recarrega o SellerGuard com o perfil recém-concluído
        // e evita redirecionamento usando estado antigo do layout.
        window.location.replace(destination);
      } catch (saveError: any) {
        console.error(
          "[Onboarding] Falha ao salvar:",
          saveError,
        );
        setError(
          saveError?.message ||
            t("onboarding.error.save"),
        );
      } finally {
        setSaving(false);
      }
    },
    [
      country,
      preferredLanguage,
      result,
      router,
      sellerId,
      setLang,
      storeName,
      t,
      timeZone,
      user,
    ]);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-neutral-50 dark:bg-neutral-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
        <p className="text-sm font-bold text-neutral-500">
          {t("onboarding.loading")}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            <Globe2
              className="h-4 w-4"
              aria-hidden="true"
            />
            {t("onboarding.eyebrow")}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-4xl">
            {t("onboarding.title")}
          </h1>

          <p className="max-w-2xl text-sm font-medium leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-base">
            {t("onboarding.subtitle")}
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <FieldHeader
            icon={Building2}
            title={t(
              "onboarding.storeName",
            )}
            description={t(
              "onboarding.storeName.help",
            )}
          />

          <input
            value={storeName}
            onChange={(event) =>
              setStoreName(
                event.target.value,
              )
            }
            maxLength={100}
            autoComplete="organization"
            placeholder={t(
              "onboarding.storeName.placeholder",
            )}
            className="min-h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-base text-neutral-950 outline-none transition focus-visible:border-black focus-visible:ring-2 focus-visible:ring-black/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:border-white dark:focus-visible:ring-white/10"
          />
        </section>

        <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <FieldHeader
            icon={MapPin}
            title={t(
              "onboarding.country",
            )}
            description={t(
              "onboarding.country.help",
            )}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              Object.keys(
                COUNTRY_DEFINITIONS,
              ) as OperatingCountry[]
            ).map((countryCode) => {
              const definition =
                getCountryDefinition(
                  countryCode,
                );
              const selected =
                country === countryCode;

              return (
                <button
                  key={countryCode}
                  type="button"
                  onClick={() =>
                    setCountry(countryCode)
                  }
                  aria-pressed={selected}
                  className={`relative min-h-28 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white ${
                    selected
                      ? "border-black bg-neutral-950 text-white shadow-lg dark:border-white dark:bg-white dark:text-black"
                      : "border-neutral-200 bg-neutral-50 text-neutral-900 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:hover:border-neutral-500"
                  }`}
                >
                  {selected && (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-black">
                      <Check
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    </span>
                  )}

                  <p className="text-xs font-bold uppercase tracking-wider opacity-60">
                    {countryCode}
                  </p>
                  <p className="mt-2 text-base font-black">
                    {definition.label[lang]}
                  </p>
                  <p className="mt-1 text-xs font-medium opacity-70">
                    {definition.currency}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-2 sm:p-8">
          <div className="space-y-4">
            <FieldHeader
              icon={Clock3}
              title={t(
                "onboarding.timeZone",
              )}
              description={t(
                "onboarding.timeZone.help",
              )}
            />

            <select
              value={timeZone}
              onChange={(event) =>
                setTimeZone(
                  event.target.value,
                )
              }
              className="min-h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-950 outline-none transition focus-visible:border-black focus-visible:ring-2 focus-visible:ring-black/10 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:border-white"
            >
              {countryDefinition.allowedTimeZones.map(
                (zone) => (
                  <option
                    key={zone}
                    value={zone}
                  >
                    {getTimeZoneLabel(
                      zone,
                      lang,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="space-y-4">
            <FieldHeader
              icon={Languages}
              title={t(
                "onboarding.language",
              )}
              description={t(
                "onboarding.language.help",
              )}
            />

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  "pt",
                  "en",
                  "ja",
                ] as SupportedLanguage[]
              ).map((language) => {
                const selected =
                  preferredLanguage ===
                  language;

                return (
                  <button
                    key={language}
                    type="button"
                    onClick={() =>
                      setPreferredLanguage(
                        language,
                      )
                    }
                    aria-pressed={selected}
                    className={`min-h-12 rounded-2xl border text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white ${
                      selected
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
                    }`}
                  >
                    {language.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-6">
          <h2 className="text-sm font-black text-amber-950 dark:text-amber-200">
            {t("onboarding.summary")}
          </h2>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <SummaryItem
              label={t(
                "onboarding.country",
              )}
              value={
                countryDefinition.label[lang]
              }
            />
            <SummaryItem
              label={t(
                "onboarding.currency",
              )}
              value={`${regional.currency} · ${t(
                "onboarding.currency.auto",
              )}`}
            />
            <SummaryItem
              label={t(
                "onboarding.timeZone",
              )}
              value={getTimeZoneLabel(
                regional.timeZone,
                lang,
              )}
            />
          </dl>
        </section>

        <button
          type="button"
          onClick={() =>
            void handleSave()
          }
          disabled={
            saving ||
            !storeName.trim()
          }
          className="min-h-14 w-full rounded-2xl bg-black px-6 text-base font-black text-white shadow-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950"
        >
          {saving
            ? t("onboarding.saving")
            : t("onboarding.save")}
        </button>
      </div>
    </main>
  );
}

function FieldHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white">
        <Icon
          className="h-5 w-5"
          aria-hidden="true"
        />
      </span>
      <div>
        <h2 className="text-base font-black text-neutral-950 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        {label}
      </dt>
      <dd className="mt-1 font-black text-amber-950 dark:text-amber-100">
        {value}
      </dd>
    </div>
  );
}
