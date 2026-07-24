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
  Save,
} from "lucide-react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  getEffectiveSellerAccess,
} from "@/app/lib/access-control";
import {
  ensureUserProfile,
} from "@/app/lib/ensureUserProfile";
import {
  COUNTRY_DEFINITIONS,
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

export default function SellerSettingsPage() {
  const router = useRouter();
  const {
    lang,
    setLang,
  } = useI18n();

  const [user, setUser] =
    useState<User | null>(null);
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
  const [accessLabel, setAccessLabel] =
    useState("");
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [error, setError] =
    useState("");

  const copy =
    lang === "ja"
      ? {
          title: "店舗設定",
          subtitle: "公開情報、地域、言語を管理します。",
          store: "店舗名",
          country: "営業国",
          timezone: "タイムゾーン",
          language: "管理画面と店舗の既定言語",
          save: "変更を保存",
          saving: "保存中…",
          saved: "設定を保存しました。",
          required: "店舗名を入力してください。",
          access: "現在のアクセス",
          plans: "プランを管理",
          loading: "設定を読み込んでいます…",
        }
      : lang === "en"
        ? {
            title: "Store settings",
            subtitle: "Manage public identity, region, and language.",
            store: "Store name",
            country: "Operating country",
            timezone: "Time zone",
            language: "Default dashboard and storefront language",
            save: "Save changes",
            saving: "Saving…",
            saved: "Settings saved.",
            required: "Enter the store name.",
            access: "Current access",
            plans: "Manage plan",
            loading: "Loading settings…",
          }
        : {
            title: "Configurações da loja",
            subtitle: "Gerencie identidade pública, região e idioma.",
            store: "Nome da loja",
            country: "País de operação",
            timezone: "Fuso horário",
            language: "Idioma padrão do painel e da loja",
            save: "Salvar alterações",
            saving: "Salvando…",
            saved: "Configurações salvas.",
            required: "Informe o nome da loja.",
            access: "Acesso atual",
            plans: "Gerenciar plano",
            loading: "Carregando configurações…",
          };

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

        const access =
          getEffectiveSellerAccess(
            result.sellerDoc,
          );

        setUser(currentUser);
        setSellerId(
          resolvedSellerId,
        );
        setStoreName(
          regional.storeName,
        );
        setCountry(
          regional.operatingCountry ??
          "JP",
        );
        setTimeZone(
          regional.timeZone ||
          "Asia/Tokyo",
        );
        setLanguage(
          regional.defaultLanguage,
        );
        setAccessLabel(
          `${access.planId.toUpperCase()} · ${
            access.mode === "lifetime"
              ? "LIFETIME"
              : (
                  access.billingInterval ??
                  "monthly"
                ).toUpperCase()
          } · ${access.status}`,
        );
      } catch (loadError: unknown) {
        console.error(
          "[SellerSettings] load:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "SETTINGS_LOAD_FAILED",
        );
      } finally {
        setLoading(false);
      }
    },
    [lang, router],
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

  const save = useCallback(
    async () => {
      if (
        !user ||
        !sellerId
      ) {
        return;
      }

      const normalizedName =
        storeName.trim();

      if (!normalizedName) {
        setError(copy.required);
        return;
      }

      setSaving(true);
      setError("");
      setMessage("");

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
            storeName:
              normalizedName,
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
        setMessage(copy.saved);
      } catch (saveError: unknown) {
        console.error(
          "[SellerSettings] save:",
          saveError,
        );

        setError(
          saveError instanceof Error
            ? saveError.message
            : "SETTINGS_SAVE_FAILED",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      copy.required,
      copy.saved,
      country,
      language,
      sellerId,
      setLang,
      storeName,
      timeZone,
      user,
    ]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm font-black text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {copy.subtitle}
        </p>
      </header>

      <section className="mt-8 space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
        <SettingField
          icon={Building2}
          label={copy.store}
        >
          <input
            value={storeName}
            maxLength={120}
            onChange={(event) =>
              setStoreName(
                event.target.value,
              )
            }
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          />
        </SettingField>

        <SettingField
          icon={Globe2}
          label={copy.country}
        >
          <select
            value={country}
            onChange={(event) =>
              setCountry(
                event.target.value as OperatingCountry,
              )
            }
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          >
            {(
              Object.keys(
                COUNTRY_DEFINITIONS,
              ) as OperatingCountry[]
            ).map((option) => (
              <option
                key={option}
                value={option}
              >
                {
                  COUNTRY_DEFINITIONS[
                    option
                  ].label[lang]
                }
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          icon={Clock3}
          label={copy.timezone}
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
        </SettingField>

        <SettingField
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
        </SettingField>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
          <p className="text-xs font-black uppercase tracking-widest text-violet-600">
            {copy.access}
          </p>
          <p className="mt-1 font-black">
            {accessLabel}
          </p>
          <button
            type="button"
            onClick={() =>
              router.push(
                "/seller/rent",
              )
            }
            className="mt-3 text-xs font-black text-violet-700 underline dark:text-violet-300"
          >
            {copy.plans}
          </button>
        </div>

        {(message || error) && (
          <p className={`rounded-2xl border p-4 text-sm font-bold ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}>
            {error || message}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            void save()
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          <Save className="h-4 w-4" />
          {saving
            ? copy.saving
            : copy.save}
        </button>
      </section>
    </main>
  );
}

function SettingField({
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
