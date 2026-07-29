"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  CheckCircle2,
  MapPin,
  PackageCheck,
  Plus,
  Save,
  Store,
  Trash2,
  Truck,
} from "lucide-react";

import { db } from "@/app/lib/firebase";
import { majorToMinor, minorToMajor } from "@/app/lib/money";
import {
  DEFAULT_SELLER_SHIPPING_SETTINGS,
  normalizeSellerShippingSettings,
  type FulfillmentMethodConfig,
  type LocalDeliveryRegionRule,
  type PostalPricingMode,
} from "@/app/lib/shipping-schema";
import type { SupportedCurrency } from "@/app/types/regional";

type Props = {
  sellerId: string;
  userUid: string;
  currency: SupportedCurrency;
  language: string;
};

type MethodForm = {
  enabled: boolean;
  label: string;
  description: string;
  instructions: string;
  fee: string;
  minimumOrder: string;
  freeAbove: string;
  estimatedDaysMin: string;
  estimatedDaysMax: string;
};

type RegionForm = MethodForm & {
  id: string;
  name: string;
};

type WeightBandForm = {
  id: string;
  maxWeightKg: string;
  price: string;
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function optionalString(value: number | null): string {
  return value === null ? "" : String(value);
}

function methodToForm(
  method: FulfillmentMethodConfig,
  currency: SupportedCurrency,
): MethodForm {
  return {
    enabled: method.enabled,
    label: method.label,
    description: method.description,
    instructions: method.instructions,
    fee: method.feeMinor > 0 ? String(minorToMajor(method.feeMinor, currency)) : "",
    minimumOrder:
      method.minimumOrderMinor === null
        ? ""
        : String(minorToMajor(method.minimumOrderMinor, currency)),
    freeAbove:
      method.freeAboveMinor === null
        ? ""
        : String(minorToMajor(method.freeAboveMinor, currency)),
    estimatedDaysMin: optionalString(method.estimatedDaysMin),
    estimatedDaysMax: optionalString(method.estimatedDaysMax),
  };
}

function regionToForm(
  region: LocalDeliveryRegionRule,
  currency: SupportedCurrency,
): RegionForm {
  return {
    id: region.id || makeId("region"),
    name: region.name,
    enabled: region.enabled,
    label: "",
    description: "",
    instructions: region.instructions,
    fee: region.feeMinor > 0 ? String(minorToMajor(region.feeMinor, currency)) : "",
    minimumOrder:
      region.minimumOrderMinor === null
        ? ""
        : String(minorToMajor(region.minimumOrderMinor, currency)),
    freeAbove:
      region.freeAboveMinor === null
        ? ""
        : String(minorToMajor(region.freeAboveMinor, currency)),
    estimatedDaysMin: optionalString(region.estimatedDaysMin),
    estimatedDaysMax: optionalString(region.estimatedDaysMax),
  };
}

function emptyRegion(): RegionForm {
  return {
    id: makeId("region"),
    name: "",
    enabled: true,
    label: "",
    description: "",
    instructions: "",
    fee: "",
    minimumOrder: "",
    freeAbove: "",
    estimatedDaysMin: "",
    estimatedDaysMax: "",
  };
}

function emptyBand(): WeightBandForm {
  return {
    id: makeId("band"),
    maxWeightKg: "2",
    price: "",
  };
}

function decimal(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalMinor(value: string, currency: SupportedCurrency): number | null {
  const parsed = decimal(value);
  if (parsed === null) return null;
  return parsed < 0 ? Number.NaN : majorToMinor(parsed, currency);
}

function optionalDay(value: string): number | null {
  const parsed = decimal(value);
  if (parsed === null) return null;
  return parsed < 0 || !Number.isInteger(parsed) || parsed > 365
    ? Number.NaN
    : parsed;
}

function normalizeRange(
  minimumValue: string,
  maximumValue: string,
): { minimum: number | null; maximum: number | null; valid: boolean } {
  const minimum = optionalDay(minimumValue);
  const maximum = optionalDay(maximumValue);
  if (Number.isNaN(minimum) || Number.isNaN(maximum)) {
    return { minimum: null, maximum: null, valid: false };
  }
  if (minimum !== null && maximum !== null && minimum > maximum) {
    return { minimum, maximum, valid: false };
  }
  return { minimum, maximum, valid: true };
}

function copyFor(language: string) {
  if (language === "ja") {
    return {
      title: "受取・配送設定",
      subtitle: "店頭受取、地域配達、郵送を個別に設定します。商品ごとの許可設定と組み合わせて利用されます。",
      loading: "配送設定を読み込んでいます…",
      save: "受取・配送設定を保存",
      saving: "保存中…",
      saved: "受取・配送設定を保存しました。",
      loadError: "配送設定を読み込めませんでした。",
      saveError: "配送設定を保存できませんでした。",
      atLeastOne: "少なくとも1つの受取方法を有効にしてください。",
      invalidNumber: "料金、注文金額、日数を正しく入力してください。",
      invalidRegion: "配達地域の名前と設定を確認してください。",
      invalidBand: "重量帯の重量と送料を確認してください。",
      duplicateBand: "重量帯の上限を重複させることはできません。",
      pickup: "店頭受取",
      delivery: "地域配達",
      postal: "郵送",
      enabled: "有効",
      methodLabel: "お客様に表示する名前（任意）",
      description: "短い説明（任意）",
      instructions: "案内・注意事項（任意）",
      fee: "基本料金",
      minimumOrder: "最低注文金額（任意）",
      freeAbove: "送料無料になる注文金額（任意）",
      estimatedMin: "最短日数（任意）",
      estimatedMax: "最長日数（任意）",
      pickupHelp: "店舗や指定場所での受取条件を設定します。",
      deliveryHelp: "基本料金または地域別料金を設定できます。",
      postalHelp: "着払い、要相談、重量別料金から選択できます。",
      regions: "配達地域",
      regionsHelp: "地域を登録すると、お客様は配達先地域を選択して送料を確認します。未登録の場合は基本料金が使われます。",
      addRegion: "地域を追加",
      regionName: "地域名",
      remove: "削除",
      pricingMode: "送料の設定方法",
      collect: "着払い",
      arrange: "要相談",
      weightTable: "重量別料金",
      bands: "重量帯",
      addBand: "重量帯を追加",
      maxWeight: "上限重量 (kg)",
      shippingPrice: "送料",
      currencyHint: "金額は {currency} で入力します。空欄は条件なし、料金は無料として扱われます。",
    };
  }

  if (language === "en") {
    return {
      title: "Fulfillment and shipping",
      subtitle: "Configure pickup, local delivery, and postal shipping independently. Product-level permissions are applied together with these settings.",
      loading: "Loading fulfillment settings…",
      save: "Save fulfillment settings",
      saving: "Saving…",
      saved: "Fulfillment settings saved.",
      loadError: "Could not load fulfillment settings.",
      saveError: "Could not save fulfillment settings.",
      atLeastOne: "Enable at least one fulfillment method.",
      invalidNumber: "Check fees, order thresholds, and estimated days.",
      invalidRegion: "Check the delivery region names and settings.",
      invalidBand: "Check the weight and price in each postal band.",
      duplicateBand: "Maximum weights cannot be repeated.",
      pickup: "Pickup",
      delivery: "Local delivery",
      postal: "Postal shipping",
      enabled: "Enabled",
      methodLabel: "Customer-facing name (optional)",
      description: "Short description (optional)",
      instructions: "Instructions or notes (optional)",
      fee: "Base fee",
      minimumOrder: "Minimum order value (optional)",
      freeAbove: "Free above order value (optional)",
      estimatedMin: "Minimum estimated days (optional)",
      estimatedMax: "Maximum estimated days (optional)",
      pickupHelp: "Define the conditions for collection at the store or agreed location.",
      deliveryHelp: "Use a base fee or create different delivery regions.",
      postalHelp: "Choose pay on delivery, price to be arranged, or a weight table.",
      regions: "Delivery regions",
      regionsHelp: "When regions are configured, customers select one to receive the correct fee. Without regions, the base fee is used.",
      addRegion: "Add region",
      regionName: "Region name",
      remove: "Remove",
      pricingMode: "Shipping price method",
      collect: "Pay on delivery",
      arrange: "To be arranged",
      weightTable: "Weight table",
      bands: "Weight bands",
      addBand: "Add weight band",
      maxWeight: "Maximum weight (kg)",
      shippingPrice: "Shipping price",
      currencyHint: "Enter amounts in {currency}. Blank thresholds mean no restriction; a blank fee is treated as free.",
    };
  }

  return {
    title: "Formas de recebimento e frete",
    subtitle: "Configure retirada, delivery local e correio separadamente. As permissões de cada produto serão combinadas com estas configurações.",
    loading: "Carregando configurações de entrega…",
    save: "Salvar recebimento e frete",
    saving: "Salvando…",
    saved: "Configurações de recebimento e frete salvas.",
    loadError: "Não foi possível carregar as configurações de frete.",
    saveError: "Não foi possível salvar as configurações de frete.",
    atLeastOne: "Ative pelo menos uma forma de recebimento.",
    invalidNumber: "Confira os valores, limites de pedido e prazos informados.",
    invalidRegion: "Confira os nomes e as configurações das regiões de delivery.",
    invalidBand: "Confira o peso e o preço de cada faixa postal.",
    duplicateBand: "Não é possível repetir o mesmo peso máximo.",
    pickup: "Retirada",
    delivery: "Delivery local",
    postal: "Envio por correio",
    enabled: "Ativo",
    methodLabel: "Nome exibido ao cliente (opcional)",
    description: "Descrição curta (opcional)",
    instructions: "Instruções ou observações (opcional)",
    fee: "Taxa base",
    minimumOrder: "Pedido mínimo (opcional)",
    freeAbove: "Grátis acima de (opcional)",
    estimatedMin: "Prazo mínimo em dias (opcional)",
    estimatedMax: "Prazo máximo em dias (opcional)",
    pickupHelp: "Defina as condições para retirada na loja ou no local combinado.",
    deliveryHelp: "Use uma taxa base ou cadastre valores diferentes por região.",
    postalHelp: "Escolha frete a cobrar, a combinar ou calculado por peso.",
    regions: "Regiões de delivery",
    regionsHelp: "Ao cadastrar regiões, o cliente seleciona uma delas e recebe o valor correto. Sem regiões, será usada a taxa base.",
    addRegion: "Adicionar região",
    regionName: "Nome da região",
    remove: "Remover",
    pricingMode: "Forma de cobrança do frete",
    collect: "Frete a cobrar",
    arrange: "Frete a combinar",
    weightTable: "Tabela por peso",
    bands: "Faixas por peso",
    addBand: "Adicionar faixa",
    maxWeight: "Até quantos kg",
    shippingPrice: "Valor do frete",
    currencyHint: "Informe valores em {currency}. Limites vazios significam sem restrição; taxa vazia é considerada grátis.",
  };
}

export default function FulfillmentSettingsCard({
  sellerId,
  userUid,
  currency,
  language,
}: Props) {
  const copy = useMemo(() => copyFor(language), [language]);
  const [pickup, setPickup] = useState<MethodForm>(() =>
    methodToForm(DEFAULT_SELLER_SHIPPING_SETTINGS.pickup, currency),
  );
  const [delivery, setDelivery] = useState<MethodForm>(() =>
    methodToForm(DEFAULT_SELLER_SHIPPING_SETTINGS.localDelivery, currency),
  );
  const [regions, setRegions] = useState<RegionForm[]>([]);
  const [postal, setPostal] = useState<MethodForm>(() =>
    methodToForm(
      { ...DEFAULT_SELLER_SHIPPING_SETTINGS.postal, feeMinor: 0 },
      currency,
    ),
  );
  const [postalPricingMode, setPostalPricingMode] =
    useState<PostalPricingMode>("arrange");
  const [weightBands, setWeightBands] = useState<WeightBandForm[]>([
    emptyBand(),
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const snapshot = await getDoc(
          doc(db, "sellers", sellerId, "settings", "shipping"),
        );
        if (cancelled) return;
        const settings = normalizeSellerShippingSettings(
          snapshot.exists()
            ? snapshot.data()
            : DEFAULT_SELLER_SHIPPING_SETTINGS,
        );
        setPickup(methodToForm(settings.pickup, currency));
        setDelivery(methodToForm(settings.localDelivery, currency));
        setRegions(
          settings.localDelivery.regions.map((region) =>
            regionToForm(region, currency),
          ),
        );
        setPostal(
          methodToForm({ ...settings.postal, feeMinor: 0 }, currency),
        );
        setPostalPricingMode(settings.postal.pricingMode);
        setWeightBands(
          settings.postal.weightBands.length > 0
            ? settings.postal.weightBands.map((band) => ({
                id: makeId("band"),
                maxWeightKg: String(band.maxWeightGrams / 1000),
                price: String(minorToMajor(band.priceMinor, currency)),
              }))
            : [emptyBand()],
        );
      } catch (loadError) {
        console.error("[FulfillmentSettingsCard] load:", loadError);
        if (!cancelled) setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, currency, sellerId]);

  const parseMethod = useCallback(
    (form: MethodForm) => {
      const feeMinor = optionalMinor(form.fee, currency);
      const minimumOrderMinor = optionalMinor(form.minimumOrder, currency);
      const freeAboveMinor = optionalMinor(form.freeAbove, currency);
      const estimated = normalizeRange(
        form.estimatedDaysMin,
        form.estimatedDaysMax,
      );
      const valid =
        !Number.isNaN(feeMinor) &&
        !Number.isNaN(minimumOrderMinor) &&
        !Number.isNaN(freeAboveMinor) &&
        estimated.valid;

      return {
        valid,
        value: {
          enabled: form.enabled,
          label: form.label.trim().slice(0, 100),
          description: form.description.trim().slice(0, 500),
          instructions: form.instructions.trim().slice(0, 1500),
          feeMinor: feeMinor ?? 0,
          minimumOrderMinor,
          freeAboveMinor,
          estimatedDaysMin: estimated.minimum,
          estimatedDaysMax: estimated.maximum,
        },
      };
    },
    [currency],
  );

  const save = useCallback(async () => {
    setMessage("");
    setError("");

    if (!pickup.enabled && !delivery.enabled && !postal.enabled) {
      setError(copy.atLeastOne);
      return;
    }

    const parsedPickup = parseMethod(pickup);
    const parsedDelivery = parseMethod(delivery);
    const parsedPostal = parseMethod(postal);
    if (!parsedPickup.valid || !parsedDelivery.valid || !parsedPostal.valid) {
      setError(copy.invalidNumber);
      return;
    }

    const normalizedRegions = regions.map((region) => {
      const parsed = parseMethod(region);
      return {
        valid: parsed.valid && Boolean(region.name.trim()),
        value: {
          id: region.id,
          name: region.name.trim().slice(0, 100),
          enabled: region.enabled,
          feeMinor: parsed.value.feeMinor,
          minimumOrderMinor: parsed.value.minimumOrderMinor,
          freeAboveMinor: parsed.value.freeAboveMinor,
          estimatedDaysMin: parsed.value.estimatedDaysMin,
          estimatedDaysMax: parsed.value.estimatedDaysMax,
          instructions: region.instructions.trim().slice(0, 1000),
        },
      };
    });
    if (normalizedRegions.some((region) => !region.valid)) {
      setError(copy.invalidRegion);
      return;
    }
    const regionNames = normalizedRegions.map((region) =>
      region.value.name.toLocaleLowerCase(),
    );
    if (new Set(regionNames).size !== regionNames.length) {
      setError(copy.invalidRegion);
      return;
    }

    const normalizedBands = weightBands
      .map((band) => {
        const maximumKg = decimal(band.maxWeightKg);
        const price = decimal(band.price);
        if (
          maximumKg === null ||
          maximumKg <= 0 ||
          price === null ||
          price < 0
        ) {
          return null;
        }
        return {
          maxWeightGrams: Math.max(1, Math.round(maximumKg * 1000)),
          priceMinor: majorToMinor(price, currency),
        };
      })
      .filter(
        (band): band is { maxWeightGrams: number; priceMinor: number } =>
          band !== null,
      )
      .sort((left, right) => left.maxWeightGrams - right.maxWeightGrams);

    if (postal.enabled && postalPricingMode === "weight_table") {
      if (normalizedBands.length === 0 || normalizedBands.length !== weightBands.length) {
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
    try {
      const timestamp = serverTimestamp();
      const postalValue = {
        enabled: parsedPostal.value.enabled,
        label: parsedPostal.value.label,
        description: parsedPostal.value.description,
        instructions: parsedPostal.value.instructions,
        minimumOrderMinor: parsedPostal.value.minimumOrderMinor,
        freeAboveMinor: parsedPostal.value.freeAboveMinor,
        estimatedDaysMin: parsedPostal.value.estimatedDaysMin,
        estimatedDaysMax: parsedPostal.value.estimatedDaysMax,
        pricingMode: postalPricingMode,
        weightBands:
          postalPricingMode === "weight_table" ? normalizedBands : [],
      };

      await setDoc(
        doc(db, "sellers", sellerId, "settings", "shipping"),
        {
          schemaVersion: 3,
          pickup: parsedPickup.value,
          localDelivery: {
            ...parsedDelivery.value,
            regions: normalizedRegions.map((region) => region.value),
          },
          postal: postalValue,

          // Legacy aliases keep older deployed clients compatible during rollout.
          postalEnabled: postalValue.enabled,
          pricingMode: postalValue.pricingMode,
          weightBands: postalValue.weightBands,
          instructions: postalValue.instructions,
          updatedAt: timestamp,
          updatedBy: userUid,
        },
        { merge: true },
      );
      setMessage(copy.saved);
    } catch (saveError) {
      console.error("[FulfillmentSettingsCard] save:", saveError);
      setError(copy.saveError);
    } finally {
      setSaving(false);
    }
  }, [
    copy.atLeastOne,
    copy.duplicateBand,
    copy.invalidBand,
    copy.invalidNumber,
    copy.invalidRegion,
    copy.saveError,
    copy.saved,
    currency,
    delivery,
    parseMethod,
    pickup,
    postal,
    postalPricingMode,
    regions,
    sellerId,
    userUid,
    weightBands,
  ]);

  if (loading) {
    return (
      <section className="rounded-[2rem] border border-blue-200 bg-blue-50/60 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
        <p className="text-sm font-black text-blue-800 dark:text-blue-200">
          {copy.loading}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-[2rem] border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20 sm:p-6">
      <div className="flex items-start gap-3">
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
        <div>
          <h2 className="text-lg font-black">{copy.title}</h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-800/80 dark:text-blue-200/80">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <MethodPanel
        title={copy.pickup}
        help={copy.pickupHelp}
        icon={<Store className="h-5 w-5" />}
        form={pickup}
        setForm={setPickup}
        copy={copy}
        currency={currency}
      />

      <MethodPanel
        title={copy.delivery}
        help={copy.deliveryHelp}
        icon={<MapPin className="h-5 w-5" />}
        form={delivery}
        setForm={setDelivery}
        copy={copy}
        currency={currency}
      >
        {delivery.enabled && (
          <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">{copy.regions}</p>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {copy.regionsHelp}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRegions((current) => [...current, emptyRegion()])}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-black text-blue-800 dark:border-blue-800 dark:bg-neutral-950 dark:text-blue-200"
              >
                <Plus className="h-4 w-4" />
                {copy.addRegion}
              </button>
            </div>

            {regions.map((region, index) => (
              <div
                key={region.id}
                className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={region.enabled}
                    onChange={(event) =>
                      setRegions((current) =>
                        current.map((item) =>
                          item.id === region.id
                            ? { ...item, enabled: event.target.checked }
                            : item,
                        ),
                      )
                    }
                    className="h-5 w-5 accent-blue-700"
                  />
                  <input
                    value={region.name}
                    onChange={(event) =>
                      setRegions((current) =>
                        current.map((item) =>
                          item.id === region.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={copy.regionName}
                    className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    type="button"
                    aria-label={`${copy.remove} ${index + 1}`}
                    onClick={() =>
                      setRegions((current) =>
                        current.filter((item) => item.id !== region.id),
                      )
                    }
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 text-red-600 dark:border-red-900/50 dark:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <CommercialFields
                  form={region}
                  setForm={(updater) =>
                    setRegions((current) =>
                      current.map((item) =>
                        item.id === region.id
                          ? { ...item, ...updater(item), id: item.id, name: item.name }
                          : item,
                      ),
                    )
                  }
                  copy={copy}
                  currency={currency}
                  hideIdentity
                />
              </div>
            ))}
          </div>
        )}
      </MethodPanel>

      <MethodPanel
        title={copy.postal}
        help={copy.postalHelp}
        icon={<PackageCheck className="h-5 w-5" />}
        form={postal}
        setForm={setPostal}
        copy={copy}
        currency={currency}
        hideFee
      >
        {postal.enabled && (
          <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                {copy.pricingMode}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([
                  ["collect", copy.collect],
                  ["arrange", copy.arrange],
                  ["weight_table", copy.weightTable],
                ] as Array<[PostalPricingMode, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPostalPricingMode(value)}
                    className={`rounded-xl border px-3 py-3 text-left text-xs font-black transition ${
                      postalPricingMode === value
                        ? "border-blue-500 bg-blue-100 ring-2 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-900"
                        : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {postalPricingMode === "weight_table" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black">{copy.bands}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setWeightBands((current) => [...current, emptyBand()])
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-black text-blue-800 dark:border-blue-800 dark:bg-neutral-950 dark:text-blue-200"
                  >
                    <Plus className="h-4 w-4" />
                    {copy.addBand}
                  </button>
                </div>
                {weightBands.map((band, index) => (
                  <div
                    key={band.id}
                    className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  >
                    <InputField
                      label={copy.maxWeight}
                      inputMode="decimal"
                      value={band.maxWeightKg}
                      onChange={(value) =>
                        setWeightBands((current) =>
                          current.map((item) =>
                            item.id === band.id
                              ? { ...item, maxWeightKg: value }
                              : item,
                          ),
                        )
                      }
                    />
                    <InputField
                      label={`${copy.shippingPrice} (${currency})`}
                      inputMode="decimal"
                      value={band.price}
                      onChange={(value) =>
                        setWeightBands((current) =>
                          current.map((item) =>
                            item.id === band.id
                              ? { ...item, price: value }
                              : item,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={`${copy.remove} ${index + 1}`}
                      onClick={() =>
                        setWeightBands((current) =>
                          current.length <= 1
                            ? [emptyBand()]
                            : current.filter((item) => item.id !== band.id),
                        )
                      }
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 dark:border-red-900/50 dark:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </MethodPanel>

      <p className="text-[11px] font-semibold text-blue-800/75 dark:text-blue-200/75">
        {copy.currencyHint.replace("{currency}", currency)}
      </p>

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold ${
            error
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
          }`}
        >
          {!error && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
          <span>{error || message}</span>
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 py-4 text-sm font-black text-white disabled:opacity-50 dark:bg-blue-500 dark:text-neutral-950"
      >
        <Save className="h-4 w-4" />
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}

function MethodPanel({
  title,
  help,
  icon,
  form,
  setForm,
  copy,
  currency,
  hideFee = false,
  children,
}: {
  title: string;
  help: string;
  icon: ReactNode;
  form: MethodForm;
  setForm: Dispatch<SetStateAction<MethodForm>>;
  copy: ReturnType<typeof copyFor>;
  currency: SupportedCurrency;
  hideFee?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-blue-200 bg-white p-4 dark:border-blue-900/50 dark:bg-neutral-950/70 sm:p-5">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-blue-700 dark:text-blue-300">{icon}</span>
          <span>
            <span className="block text-base font-black">{title}</span>
            <span className="mt-1 block text-xs font-semibold leading-relaxed text-neutral-500 dark:text-neutral-400">
              {help}
            </span>
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs font-black">
          {copy.enabled}
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
            className="h-5 w-5 accent-blue-700"
          />
        </span>
      </label>

      {form.enabled && (
        <>
          <CommercialFields
            form={form}
            setForm={setForm}
            copy={copy}
            currency={currency}
            hideFee={hideFee}
          />
          {children}
        </>
      )}
    </div>
  );
}

function CommercialFields({
  form,
  setForm,
  copy,
  currency,
  hideFee = false,
  hideIdentity = false,
}: {
  form: MethodForm;
  setForm: (updater: (current: MethodForm) => MethodForm) => void;
  copy: ReturnType<typeof copyFor>;
  currency: SupportedCurrency;
  hideFee?: boolean;
  hideIdentity?: boolean;
}) {
  const update = (field: keyof MethodForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="space-y-3">
      {!hideIdentity && (
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            label={copy.methodLabel}
            value={form.label}
            onChange={(value) => update("label", value)}
          />
          <InputField
            label={copy.description}
            value={form.description}
            onChange={(value) => update("description", value)}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!hideFee && (
          <InputField
            label={`${copy.fee} (${currency})`}
            inputMode="decimal"
            value={form.fee}
            onChange={(value) => update("fee", value)}
          />
        )}
        <InputField
          label={`${copy.minimumOrder} (${currency})`}
          inputMode="decimal"
          value={form.minimumOrder}
          onChange={(value) => update("minimumOrder", value)}
        />
        <InputField
          label={`${copy.freeAbove} (${currency})`}
          inputMode="decimal"
          value={form.freeAbove}
          onChange={(value) => update("freeAbove", value)}
        />
        <InputField
          label={copy.estimatedMin}
          inputMode="decimal"
          value={form.estimatedDaysMin}
          onChange={(value) => update("estimatedDaysMin", value)}
        />
        <InputField
          label={copy.estimatedMax}
          inputMode="decimal"
          value={form.estimatedDaysMax}
          onChange={(value) => update("estimatedDaysMax", value)}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-black uppercase tracking-wider">
          {copy.instructions}
        </span>
        <textarea
          value={form.instructions}
          rows={3}
          maxLength={1500}
          onChange={(event) => update("instructions", event.target.value)}
          className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  inputMode = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "decimal";
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
