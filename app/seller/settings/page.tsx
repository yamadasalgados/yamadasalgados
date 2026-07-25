"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  Building2,
  Clock3,
  Globe2,
  Languages,
  PackageCheck,
  Plus,
  Save,
  Trash2,
  Truck,
} from "lucide-react";

import { auth, db } from "@/app/lib/firebase";
import { getEffectiveSellerAccess } from "@/app/lib/access-control";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { majorToMinor, minorToMajor } from "@/app/lib/money";
import {
  COUNTRY_DEFINITIONS,
  getCountryDefinition,
  getRegionalSettings,
  getTimeZoneLabel,
  isAllowedTimeZone,
} from "@/app/lib/regional";
import { normalizeSellerRegionalProfile } from "@/app/lib/seller-regional-profile";
import {
  DEFAULT_SELLER_SHIPPING_SETTINGS,
  normalizeSellerShippingSettings,
  type PostalPricingMode,
} from "@/app/lib/shipping-schema";
import { useI18n } from "@/app/lib/i18n";
import type {
  OperatingCountry,
  SupportedLanguage,
} from "@/app/types/regional";

type WeightBandForm = {
  id: string;
  maxWeightKg: string;
  price: string;
};

function makeBandId(): string {
  return `band_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBand(): WeightBandForm {
  return {
    id: makeBandId(),
    maxWeightKg: "2",
    price: "",
  };
}

export default function SellerSettingsPage() {
  const router = useRouter();
  const { lang, setLang } = useI18n();

  const [user, setUser] = useState<User | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [country, setCountry] = useState<OperatingCountry>("JP");
  const [timeZone, setTimeZone] = useState("Asia/Tokyo");
  const [language, setLanguage] = useState<SupportedLanguage>(lang);
  const [accessLabel, setAccessLabel] = useState("");

  const [postalEnabled, setPostalEnabled] = useState(false);
  const [postalPricingMode, setPostalPricingMode] =
    useState<PostalPricingMode>("arrange");
  const [postalInstructions, setPostalInstructions] = useState("");
  const [weightBands, setWeightBands] = useState<WeightBandForm[]>([
    defaultBand(),
  ]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const copy =
    lang === "ja"
      ? {
          title: "店舗設定",
          subtitle: "公開情報、地域、言語、配送を管理します。",
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
          shippingTitle: "郵送設定",
          shippingSubtitle:
            "通常ストアで郵送を利用できます。イベントには適用されません。",
          postalEnabled: "郵送を有効にする",
          pricingMode: "送料の設定方法",
          collect: "着払い",
          collectHelp: "お客様が受取時に送料を支払います。",
          arrange: "要相談",
          arrangeHelp: "注文後に販売者が送料を案内します。",
          weightTable: "重量別料金",
          weightTableHelp: "商品の合計重量に応じて送料を自動計算します。",
          maxWeight: "上限重量 (kg)",
          shippingPrice: "送料",
          addBand: "重量帯を追加",
          removeBand: "削除",
          instructions: "郵送に関する案内（任意）",
          instructionsPlaceholder: "発送日、梱包、対象地域など",
          invalidBand: "重量帯には正しい重量と送料を入力してください。",
          bandRequired: "重量別料金には少なくとも1つの重量帯が必要です。",
          duplicateBand: "同じ上限重量が重複しています。",
        }
      : lang === "en"
        ? {
            title: "Store settings",
            subtitle: "Manage public identity, region, language, and shipping.",
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
            shippingTitle: "Postal shipping",
            shippingSubtitle:
              "Postal shipping is available in the permanent store only, not in events.",
            postalEnabled: "Enable postal shipping",
            pricingMode: "Shipping price method",
            collect: "Pay on delivery",
            collectHelp: "The customer pays the carrier when the package arrives.",
            arrange: "To be arranged",
            arrangeHelp: "The seller confirms the shipping price after the order.",
            weightTable: "Weight table",
            weightTableHelp:
              "Shipping is calculated automatically from the total product weight.",
            maxWeight: "Maximum weight (kg)",
            shippingPrice: "Shipping price",
            addBand: "Add weight band",
            removeBand: "Remove",
            instructions: "Postal instructions (optional)",
            instructionsPlaceholder: "Dispatch days, packaging, covered areas, etc.",
            invalidBand: "Enter a valid maximum weight and shipping price.",
            bandRequired: "Add at least one weight band for weight-based pricing.",
            duplicateBand: "Maximum weights cannot be repeated.",
          }
        : {
            title: "Configurações da loja",
            subtitle: "Gerencie identidade pública, região, idioma e envio.",
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
            shippingTitle: "Envio por correio",
            shippingSubtitle:
              "Disponível somente na Store permanente. Não será aplicado aos eventos.",
            postalEnabled: "Ativar envio por correio",
            pricingMode: "Forma de cobrança do frete",
            collect: "Frete a cobrar",
            collectHelp: "O cliente paga o frete à transportadora no recebimento.",
            arrange: "Frete a combinar",
            arrangeHelp: "O seller informa o valor do frete depois do pedido.",
            weightTable: "Tabela por peso",
            weightTableHelp:
              "O frete é calculado automaticamente pelo peso total dos produtos.",
            maxWeight: "Até quantos kg",
            shippingPrice: "Valor do frete",
            addBand: "Adicionar faixa",
            removeBand: "Remover",
            instructions: "Instruções para envio (opcional)",
            instructionsPlaceholder:
              "Dias de postagem, embalagem, regiões atendidas e outras informações",
            invalidBand: "Informe um peso máximo e um valor de frete válidos.",
            bandRequired: "Adicione pelo menos uma faixa para a tabela por peso.",
            duplicateBand: "Não repita o mesmo peso máximo em duas faixas.",
          };

  const load = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      setError("");

      try {
        const result = await ensureUserProfile(currentUser, lang);
        const resolvedSellerId = String(
          result.userDoc.sellerId ?? currentUser.uid,
        ).trim();
        const regional = normalizeSellerRegionalProfile(result.sellerDoc, {
          fallbackSellerId: resolvedSellerId,
          fallbackLanguage: lang,
        });

        if (!regional.onboardingComplete) {
          router.replace("/seller/onboarding");
          return;
        }

        const access = getEffectiveSellerAccess(result.sellerDoc);
        const shippingSnapshot = await getDoc(
          doc(db, "sellers", resolvedSellerId, "settings", "shipping"),
        );
        const shipping = normalizeSellerShippingSettings(
          shippingSnapshot.exists()
            ? shippingSnapshot.data()
            : DEFAULT_SELLER_SHIPPING_SETTINGS,
        );
        const currency = regional.currency ?? "JPY";

        setUser(currentUser);
        setSellerId(resolvedSellerId);
        setStoreName(regional.storeName);
        setCountry(regional.operatingCountry ?? "JP");
        setTimeZone(regional.timeZone || "Asia/Tokyo");
        setLanguage(regional.defaultLanguage);
        setAccessLabel(
          `${access.planId.toUpperCase()} · ${
            access.mode === "lifetime"
              ? "LIFETIME"
              : (access.billingInterval ?? "monthly").toUpperCase()
          } · ${access.status}`,
        );
        setPostalEnabled(shipping.postalEnabled);
        setPostalPricingMode(shipping.pricingMode);
        setPostalInstructions(shipping.instructions);
        setWeightBands(
          shipping.weightBands.length > 0
            ? shipping.weightBands.map((band) => ({
                id: makeBandId(),
                maxWeightKg: String(band.maxWeightGrams / 1000),
                price: String(minorToMajor(band.priceMinor, currency)),
              }))
            : [defaultBand()],
        );
      } catch (loadError: unknown) {
        console.error("[SellerSettings] load:", loadError);
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      void load(currentUser);
    });
    return () => unsubscribe();
  }, [load, router]);

  useEffect(() => {
    if (isAllowedTimeZone(country, timeZone)) return;
    setTimeZone(getCountryDefinition(country).defaultTimeZone);
  }, [country, timeZone]);

  const countryDefinition = useMemo(
    () => getCountryDefinition(country),
    [country],
  );
  const selectedCurrency = countryDefinition.currency;

  const save = useCallback(async () => {
    if (!user || !sellerId) return;

    const normalizedName = storeName.trim();
    if (!normalizedName) {
      setError(copy.required);
      return;
    }

    const normalizedBands = weightBands
      .map((band) => {
        const maxWeightKg = Number(band.maxWeightKg.replace(",", "."));
        const price = Number(band.price.replace(",", "."));

        if (
          !Number.isFinite(maxWeightKg) ||
          maxWeightKg <= 0 ||
          !Number.isFinite(price) ||
          price < 0
        ) {
          return null;
        }

        return {
          maxWeightGrams: Math.max(1, Math.round(maxWeightKg * 1000)),
          priceMinor: majorToMinor(price, selectedCurrency),
        };
      })
      .filter(
        (band): band is { maxWeightGrams: number; priceMinor: number } =>
          band !== null,
      )
      .sort((left, right) => left.maxWeightGrams - right.maxWeightGrams);

    if (postalEnabled && postalPricingMode === "weight_table") {
      if (weightBands.length === 0) {
        setError(copy.bandRequired);
        return;
      }
      if (normalizedBands.length !== weightBands.length) {
        setError(copy.invalidBand);
        return;
      }
      if (
        new Set(normalizedBands.map((band) => band.maxWeightGrams)).size !==
        normalizedBands.length
      ) {
        setError(copy.duplicateBand);
        return;
      }
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const selected = getRegionalSettings(country, timeZone);
      const timestamp = serverTimestamp();
      const batch = writeBatch(db);

      batch.set(
        doc(db, "sellers", sellerId),
        {
          storeName: normalizedName,
          storefrontLanguage: language,
          regional: {
            operatingCountry: selected.operatingCountry,
            currency: selected.currency,
            locale: selected.regionalLocale,
            timeZone: selected.timeZone,
          },
          updatedAt: timestamp,
          updatedBy: user.uid,
        },
        { merge: true },
      );

      batch.set(
        doc(db, "users", user.uid),
        {
          uiLanguage: language,
          updatedAt: timestamp,
          updatedBy: user.uid,
        },
        { merge: true },
      );

      batch.set(
        doc(db, "sellers", sellerId, "settings", "shipping"),
        {
          schemaVersion: 2,
          postalEnabled,
          pricingMode: postalPricingMode,
          weightBands:
            postalPricingMode === "weight_table" ? normalizedBands : [],
          instructions: postalInstructions.trim().slice(0, 1500),
          updatedAt: timestamp,
          updatedBy: user.uid,
        },
        { merge: true },
      );

      await batch.commit();
      setLang(language);
      setMessage(copy.saved);
    } catch (saveError: unknown) {
      console.error("[SellerSettings] save:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "SETTINGS_SAVE_FAILED",
      );
    } finally {
      setSaving(false);
    }
  }, [
    copy.bandRequired,
    copy.duplicateBand,
    copy.invalidBand,
    copy.required,
    copy.saved,
    country,
    language,
    postalEnabled,
    postalInstructions,
    postalPricingMode,
    selectedCurrency,
    sellerId,
    setLang,
    storeName,
    timeZone,
    user,
    weightBands,
  ]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm font-black text-neutral-500">{copy.loading}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-neutral-500">{copy.subtitle}</p>
      </header>

      <section className="mt-8 space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
        <SettingField icon={Building2} label={copy.store}>
          <input
            value={storeName}
            maxLength={120}
            onChange={(event) => setStoreName(event.target.value)}
            className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
          />
        </SettingField>

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
                  {COUNTRY_DEFINITIONS[option].label[lang]}
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
                {getTimeZoneLabel(zone, lang)}
              </option>
            ))}
          </select>
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

        <section className="space-y-5 rounded-3xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
            <div>
              <h2 className="font-black">{copy.shippingTitle}</h2>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-800/80 dark:text-blue-200/80">
                {copy.shippingSubtitle}
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-white p-4 dark:border-blue-900/50 dark:bg-neutral-950/60">
            <div className="flex items-center gap-3">
              <PackageCheck className="h-5 w-5 text-blue-700 dark:text-blue-300" />
              <span className="text-sm font-black">{copy.postalEnabled}</span>
            </div>
            <input
              type="checkbox"
              checked={postalEnabled}
              onChange={(event) => setPostalEnabled(event.target.checked)}
              className="h-5 w-5 accent-blue-700"
            />
          </label>

          {postalEnabled && (
            <div className="space-y-5">
              <SettingField icon={Truck} label={copy.pricingMode}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["collect", copy.collect, copy.collectHelp],
                      ["arrange", copy.arrange, copy.arrangeHelp],
                      ["weight_table", copy.weightTable, copy.weightTableHelp],
                    ] as Array<[PostalPricingMode, string, string]>
                  ).map(([value, label, help]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPostalPricingMode(value)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        postalPricingMode === value
                          ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200 dark:border-blue-500 dark:bg-blue-950/50 dark:ring-blue-900"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950/50"
                      }`}
                    >
                      <span className="block text-sm font-black">{label}</span>
                      <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-neutral-500 dark:text-neutral-400">
                        {help}
                      </span>
                    </button>
                  ))}
                </div>
              </SettingField>

              {postalPricingMode === "weight_table" && (
                <div className="space-y-3 rounded-2xl border border-blue-200 bg-white p-4 dark:border-blue-900/40 dark:bg-neutral-950/50">
                  {weightBands.map((band, index) => (
                    <div
                      key={band.id}
                      className="grid gap-3 rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <label className="space-y-1">
                        <span className="text-xs font-black uppercase tracking-wider">
                          {copy.maxWeight}
                        </span>
                        <input
                          inputMode="decimal"
                          value={band.maxWeightKg}
                          onChange={(event) =>
                            setWeightBands((current) =>
                              current.map((item) =>
                                item.id === band.id
                                  ? { ...item, maxWeightKg: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-xs font-black uppercase tracking-wider">
                          {copy.shippingPrice} ({selectedCurrency})
                        </span>
                        <input
                          inputMode="decimal"
                          value={band.price}
                          onChange={(event) =>
                            setWeightBands((current) =>
                              current.map((item) =>
                                item.id === band.id
                                  ? { ...item, price: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </label>

                      <button
                        type="button"
                        aria-label={`${copy.removeBand} ${index + 1}`}
                        onClick={() =>
                          setWeightBands((current) =>
                            current.length <= 1
                              ? [defaultBand()]
                              : current.filter((item) => item.id !== band.id),
                          )
                        }
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-black text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden">{copy.removeBand}</span>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setWeightBands((current) => [...current, defaultBand()])
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                  >
                    <Plus className="h-4 w-4" />
                    {copy.addBand}
                  </button>
                </div>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-black">{copy.instructions}</span>
                <textarea
                  value={postalInstructions}
                  maxLength={1500}
                  rows={4}
                  placeholder={copy.instructionsPlaceholder}
                  onChange={(event) => setPostalInstructions(event.target.value)}
                  className="w-full resize-none rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
          <p className="text-xs font-black uppercase tracking-widest text-violet-600">
            {copy.access}
          </p>
          <p className="mt-1 font-black">{accessLabel}</p>
          <button
            type="button"
            onClick={() => router.push("/seller/rent")}
            className="mt-3 text-xs font-black text-violet-700 underline dark:text-violet-300"
          >
            {copy.plans}
          </button>
        </div>

        {(message || error) && (
          <p
            className={`rounded-2xl border p-4 text-sm font-bold ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {error || message}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          <Save className="h-4 w-4" />
          {saving ? copy.saving : copy.save}
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
        <label className="text-sm font-black">{label}</label>
      </div>
      {children}
    </div>
  );
}
