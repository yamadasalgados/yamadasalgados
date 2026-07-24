"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
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
} from "firebase/firestore";
import {
  Building2,
  Clock3,
  Globe2,
  Languages,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  accessIsActive,
} from "@/app/lib/access-control";
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

export default function SellerOnboardingPage() {
  const router = useRouter();
  const {
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
  const [language, setLanguage] =
    useState<SupportedLanguage>(lang);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState("");

  const copy =
    lang === "ja"
      ? {
          eyebrow: "初期設定",
          title: "販売プロフィールを設定",
          subtitle: "国を選択すると、通貨と地域設定が自動的に決まります。",
          storeName: "店舗名",
          storePlaceholder: "お客様に表示する店舗名",
          country: "営業国",
          timeZone: "タイムゾーン",
          language: "管理画面の言語",
          currency: "通貨",
          save: "設定を保存",
          saving: "保存中…",
          required: "店舗名を入力してください。",
          error: "設定を保存できませんでした。",
          loading: "プロフィールを読み込んでいます…",
        }
      : lang === "en"
        ? {
            eyebrow: "Initial setup",
            title: "Configure your seller profile",
            subtitle: "Your country determines currency and regional formatting.",
            storeName: "Store name",
            storePlaceholder: "Public name shown to customers",
            country: "Operating country",
            timeZone: "Time zone",
            language: "Dashboard language",
            currency: "Currency",
            save: "Save configuration",
            saving: "Saving…",
            required: "Enter the store name.",
            error: "We could not save the configuration.",
            loading: "Loading seller profile…",
          }
        : {
            eyebrow: "Configuração inicial",
            title: "Configure seu perfil de vendedor",
            subtitle: "O país define automaticamente moeda e formato regional.",
            storeName: "Nome da loja",
            storePlaceholder: "Nome público exibido aos clientes",
            country: "País de operação",
            timeZone: "Fuso horário",
            language: "Idioma do painel",
            currency: "Moeda",
            save: "Salvar configuração",
            saving: "Salvando…",
            required: "Informe o nome da loja.",
            error: "Não foi possível salvar a configuração.",
            loading: "Carregando perfil do vendedor…",
          };

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
            accessIsActive(
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

        const initialCountry =
          regional.operatingCountry ??
          countryFromTimeZone(
            browserTimeZone,
          ) ??
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
            ensured.userDoc
              .displayName,
          ) ||
          text(
            currentUser.displayName,
          ),
        );
        setCountry(initialCountry);
        setTimeZone(initialTimeZone);
        setLanguage(
          regional.defaultLanguage ||
          lang,
        );
      } catch (loadError: unknown) {
        console.error(
          "[Onboarding] load:",
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
    [copy.error, lang, router],
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

  const regional =
    useMemo(
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
        setError(copy.required);
        return;
      }

      setSaving(true);
      setError("");

      try {
        const selected =
          getRegionalSettings(
            country,
            timeZone,
          );

        const timestamp =
          serverTimestamp();

        const batch =
          writeBatch(db);

        batch.set(
          doc(
            db,
            "sellers",
            sellerId,
          ),
          {
            schemaVersion: 2,
            ownerUid: user.uid,
            storeName:
              normalizedStoreName,
            storefrontLanguage:
              language,

            regional: {
              operatingCountry:
                selected.operatingCountry,
              currency:
                selected.currency,
              locale:
                selected.regionalLocale,
              timeZone:
                selected.timeZone,
            },

            onboarding: {
              complete: true,
              completedAt: timestamp,
              schemaVersion: 2,
            },

            updatedAt: timestamp,
            updatedBy: user.uid,
          },
          {
            merge: true,
          },
        );

        batch.set(
          doc(
            db,
            "users",
            user.uid,
          ),
          {
            uiLanguage: language,
            updatedAt: timestamp,
            updatedBy: user.uid,
          },
          {
            merge: true,
          },
        );

        await batch.commit();
        setLang(language);

        const destination =
          accessIsActive(
            {
              ...(result.sellerDoc ?? {}),
              accountStatus:
                result.sellerDoc
                  ?.accountStatus ??
                "active",
            },
            result.userDoc,
          )
            ? "/seller"
            : "/seller/rent";

        window.location.replace(
          destination,
        );
      } catch (saveError: unknown) {
        console.error(
          "[Onboarding] save:",
          saveError,
        );

        setError(
          saveError instanceof Error
            ? saveError.message
            : copy.error,
        );
      } finally {
        setSaving(false);
      }
    }, [
      copy.error,
      copy.required,
      country,
      language,
      result,
      sellerId,
      setLang,
      storeName,
      timeZone,
      user,
    ]);

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <p className="text-sm font-bold text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
        <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-8 dark:border-neutral-800 dark:bg-neutral-900 sm:px-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">
            {copy.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-950 dark:text-white">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {copy.subtitle}
          </p>
        </div>

        <div className="space-y-6 p-6 sm:p-10">
          <Field
            icon={Building2}
            label={copy.storeName}
          >
            <input
              value={storeName}
              onChange={(event) =>
                setStoreName(
                  event.target.value,
                )
              }
              maxLength={120}
              placeholder={
                copy.storePlaceholder
              }
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-950 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
          </Field>

          <Field
            icon={Globe2}
            label={copy.country}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                Object.keys(
                  COUNTRY_DEFINITIONS,
                ) as OperatingCountry[]
              ).map((option) => {
                const definition =
                  getCountryDefinition(
                    option,
                  );

                const selected =
                  country === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setCountry(option)
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-orange-500 bg-orange-50 ring-4 ring-orange-500/10 dark:bg-orange-950/20"
                        : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-800"
                    }`}
                  >
                    <p className="text-xs font-black text-neutral-400">
                      {option}
                    </p>
                    <p className="mt-1 font-black">
                      {
                        definition.label[
                          lang
                        ]
                      }
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {
                        definition.currency
                      }
                    </p>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            icon={Clock3}
            label={copy.timeZone}
          >
            <select
              value={timeZone}
              onChange={(event) =>
                setTimeZone(
                  event.target.value,
                )
              }
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
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
          </Field>

          <Field
            icon={Languages}
            label={copy.language}
          >
            <select
              value={language}
              onChange={(event) =>
                setLanguage(
                  event.target.value as SupportedLanguage,
                )
              }
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="pt">
                Português
              </option>
              <option value="en">
                English
              </option>
              <option value="ja">
                日本語
              </option>
            </select>
          </Field>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">
              {copy.currency}
            </p>
            <p className="mt-1 text-xl font-black">
              {regional.currency}
            </p>
          </div>

          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() =>
              void handleSave()
            }
            disabled={saving}
            className="w-full rounded-2xl bg-black px-5 py-4 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {saving
              ? copy.saving
              : copy.save}
          </button>
        </div>
      </section>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-600" />
        <label className="text-sm font-black">
          {label}
        </label>
      </div>
      {children}
    </div>
  );
}
