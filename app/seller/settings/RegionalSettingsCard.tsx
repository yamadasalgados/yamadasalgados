"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import {
  Clock3,
  CircleDollarSign,
  Globe2,
  Languages,
  LoaderCircle,
  Save,
  type LucideIcon,
} from "lucide-react";

import FeedbackBanner from "@/app/_components/FeedbackBanner";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import { db } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";
import {
  COUNTRY_DEFINITIONS,
  getCountryDefinition,
  getRegionalSettings,
  getTimeZoneLabel,
  isAllowedTimeZone,
} from "@/app/lib/regional";
import type {
  OperatingCountry,
  SupportedLanguage,
} from "@/app/types/regional";

function languageKey(value: string): SupportedLanguage {
  return value === "en" || value === "ja" ? value : "pt";
}

const COPY = {
  pt: {
    title: "Região, idioma e moeda",
    subtitle:
      "Essas informações definem a moeda dos preços, as datas, os horários e o idioma padrão da experiência.",
    country: "País de operação",
    timezone: "Fuso horário",
    currency: "Moeda aplicada",
    language: "Idioma padrão do painel e da loja",
    currencyHelp:
      "A moeda é definida automaticamente pelo país de operação para manter os cálculos consistentes.",
    save: "Salvar configuração regional",
    saving: "Salvando…",
    saved: "Configuração regional salva.",
    loading: "Carregando configuração regional…",
  },
  en: {
    title: "Region, language, and currency",
    subtitle:
      "These settings define price currency, dates, times, and the default experience language.",
    country: "Operating country",
    timezone: "Time zone",
    currency: "Applied currency",
    language: "Default dashboard and store language",
    currencyHelp:
      "Currency is selected automatically from the operating country to keep calculations consistent.",
    save: "Save regional settings",
    saving: "Saving…",
    saved: "Regional settings saved.",
    loading: "Loading regional settings…",
  },
  ja: {
    title: "地域・言語・通貨",
    subtitle:
      "価格の通貨、日付、時刻、管理画面と店舗の既定言語を設定します。",
    country: "営業国",
    timezone: "タイムゾーン",
    currency: "適用通貨",
    language: "管理画面と店舗の既定言語",
    currencyHelp:
      "計算の整合性を保つため、通貨は営業国から自動的に設定されます。",
    save: "地域設定を保存",
    saving: "保存中…",
    saved: "地域設定を保存しました。",
    loading: "地域設定を読み込んでいます…",
  },
} as const;

export default function RegionalSettingsCard() {
  const { lang, setLang } = useI18n();
  const session = useSellerSession();
  const copy = COPY[languageKey(lang)];

  const [country, setCountry] = useState<OperatingCountry>("JP");
  const [timeZone, setTimeZone] = useState("Asia/Tokyo");
  const [language, setLanguage] = useState<SupportedLanguage>(languageKey(lang));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCountry(session.profile.operatingCountry ?? "JP");
    setTimeZone(session.profile.timeZone || "Asia/Tokyo");
    setLanguage(session.profile.defaultLanguage ?? languageKey(lang));
    setLoading(false);
  }, [lang, session.profile]);

  useEffect(() => {
    if (isAllowedTimeZone(country, timeZone)) return;
    setTimeZone(getCountryDefinition(country).defaultTimeZone);
  }, [country, timeZone]);

  const countryDefinition = useMemo(
    () => getCountryDefinition(country),
    [country],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const selected = getRegionalSettings(country, timeZone);
      const timestamp = serverTimestamp();
      const batch = writeBatch(db);

      batch.set(
        doc(db, "sellers", session.sellerId),
        {
          storefrontLanguage: language,
          regional: {
            operatingCountry: selected.operatingCountry,
            currency: selected.currency,
            locale: selected.regionalLocale,
            timeZone: selected.timeZone,
          },
          updatedAt: timestamp,
          updatedBy: session.user.uid,
        },
        { merge: true },
      );

      batch.set(
        doc(db, "users", session.user.uid),
        {
          uiLanguage: language,
          updatedAt: timestamp,
          updatedBy: session.user.uid,
        },
        { merge: true },
      );

      await batch.commit();
      await session.reloadProfile();
      setLang(language);
      setMessage(copy.saved);
    } catch (saveError: unknown) {
      console.error("[RegionalSettingsCard] save:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "REGIONAL_SETTINGS_SAVE_FAILED",
      );
    } finally {
      setSaving(false);
    }
  }, [copy.saved, country, language, session, setLang, timeZone]);

  if (loading) {
    return (
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
        <p className="inline-flex items-center gap-2 text-sm font-black text-neutral-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {copy.loading}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
      <div>
        <h2 className="text-xl font-black">{copy.title}</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
          {copy.subtitle}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingField icon={Globe2} label={copy.country}>
          <select
            value={country}
            onChange={(event) =>
              setCountry(event.target.value as OperatingCountry)
            }
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          >
            {(Object.keys(COUNTRY_DEFINITIONS) as OperatingCountry[]).map(
              (option) => (
                <option key={option} value={option}>
                  {COUNTRY_DEFINITIONS[option].label[languageKey(lang)]}
                </option>
              ),
            )}
          </select>
        </SettingField>

        <SettingField icon={Clock3} label={copy.timezone}>
          <select
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          >
            {countryDefinition.allowedTimeZones.map((zone) => (
              <option key={zone} value={zone}>
                {getTimeZoneLabel(zone, languageKey(lang))}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField icon={CircleDollarSign} label={copy.currency}>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            <p className="text-sm font-black">{countryDefinition.currency}</p>
            <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
              {copy.currencyHelp}
            </p>
          </div>
        </SettingField>

        <SettingField icon={Languages} label={copy.language}>
          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as SupportedLanguage)
            }
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </SettingField>
      </div>

      {(message || error) && (
        <FeedbackBanner
          tone={error ? "error" : "success"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </FeedbackBanner>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {saving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}

function SettingField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-600 dark:text-orange-300" />
        <label className="text-sm font-black">{label}</label>
      </div>
      {children}
    </div>
  );
}
