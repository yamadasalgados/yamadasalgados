"use client";

import type { RefObject } from "react";
import type { ProductContent, ProductLanguage } from "@/app/lib/product-schema";
import type { SupportedCurrency } from "@/app/types/regional";
import type { ProductFormErrors, ProductStatus } from "./product-types";

type Props = {
  t: (key: string) => string;
  lang: string;
  currency: SupportedCurrency;
  disabled: boolean;
  categorySaving: boolean;
  nameInputRef: RefObject<HTMLInputElement | null>;
  errors: ProductFormErrors;
  categories: string[];
  category: string;
  setCategory: (value: string) => void;
  creatingCategory: boolean;
  setCreatingCategory: (value: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (value: string) => void;
  onCreateCategory: () => void;
  legacyName: string;
  setLegacyName: (value: string) => void;
  content: ProductContent;
  setContent: (value: ProductContent) => void;
  costPrice: string;
  setCostPrice: (value: string) => void;
  sellPrice: string;
  setSellPrice: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  reservedStock: number;
  stockQty: string;
  setStockQty: (value: string) => void;
  lowStockThreshold: string;
  setLowStockThreshold: (value: string) => void;
  inventoryTracked: boolean;
  setInventoryTracked: (value: boolean) => void;
  postalEligible: boolean;
  setPostalEligible: (value: boolean) => void;
  shippingWeightGrams: string;
  setShippingWeightGrams: (value: string) => void;
  status: ProductStatus;
  setStatus: (value: ProductStatus) => void;
  existingImageUrl: string;
  existingExtraUrls: string[];
  mainPreview: string;
  extraPreviews: string[];
  onPickMain: (file: File | null) => void;
  onPickExtras: (files: FileList | null) => void;
  removeExistingExtra: (url: string) => void;
  clearSelectedExtras: () => void;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="mt-1 text-xs font-bold text-red-600 dark:text-red-300">{message}</p> : null;
}

function fieldClass(error = false) {
  return `w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition dark:bg-neutral-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60 ${error ? "border-red-400 focus:ring-2 focus:ring-red-400" : "border-neutral-200 focus:ring-2 focus:ring-black dark:border-neutral-800 dark:focus:ring-white"}`;
}

const LANGUAGES: Array<{ id: ProductLanguage; label: string }> = [
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];

export default function ProductForm(props: Props) {
  const {
    t, lang, currency, disabled, categorySaving, nameInputRef, errors,
    categories, category, setCategory, creatingCategory, setCreatingCategory,
    newCategoryName, setNewCategoryName, onCreateCategory, legacyName,
    setLegacyName, content, setContent, costPrice, setCostPrice, sellPrice,
    setSellPrice, quantity, setQuantity, reservedStock, stockQty, setStockQty,
    lowStockThreshold, setLowStockThreshold, inventoryTracked,
    setInventoryTracked, postalEligible, setPostalEligible,
    shippingWeightGrams, setShippingWeightGrams, status, setStatus, existingImageUrl,
    existingExtraUrls, mainPreview, extraPreviews, onPickMain, onPickExtras,
    removeExistingExtra, clearSelectedExtras,
  } = props;

  const copy = lang === "ja"
    ? { translations: "商品内容（多言語）", defaultName: "標準商品名", short: "短い説明", details: "詳細", ingredients: "原材料", allergens: "アレルゲン", units: "販売単位", stock: "実在庫数", threshold: "在庫不足の基準", track: "在庫を管理する", main: "メイン画像", extras: "追加画像", current: "現在の画像（クリックで削除）", queue: "アップロード予定", creating: "作成中...", madeToOrder: "受注生産", madeToOrderHelp: "通常在庫ではなく、事前予約で販売する商品です。", postal: "郵送対象", postalHelp: "この商品を通常ストアから郵送できます。", weight: "発送重量 (g)", weightHelp: "重量別送料を使う場合に必要です。梱包後のおおよその重量を入力してください。", reserved: "予約済み", availableAfterReserved: "予約を除く利用可能数" }
    : lang === "en"
      ? { translations: "Multilingual product content", defaultName: "Default product name", short: "Short description", details: "Details", ingredients: "Ingredients", allergens: "Allergens", units: "Units per sale", stock: "Physical stock", threshold: "Low-stock threshold", track: "Track inventory", main: "Main image", extras: "Extra images", current: "Current images (click to remove)", queue: "Upload queue", creating: "Creating...", madeToOrder: "Made to order", madeToOrderHelp: "This item is sold by advance reservation rather than regular stock.", postal: "Postal eligible", postalHelp: "This product may be shipped from the permanent store.", weight: "Shipping weight (g)", weightHelp: "Required for weight-based shipping. Enter the approximate packed weight.", reserved: "Reserved", availableAfterReserved: "Available after reservations" }
      : { translations: "Conteúdo multilíngue do produto", defaultName: "Nome padrão do produto", short: "Descrição curta", details: "Detalhes", ingredients: "Ingredientes", allergens: "Alérgenos", units: "Unidades por venda", stock: "Estoque físico", threshold: "Limite de estoque baixo", track: "Controlar estoque", main: "Imagem principal", extras: "Imagens extras", current: "Imagens atuais (clique para remover)", queue: "Fila de upload", creating: "Criando...", madeToOrder: "Sob encomenda", madeToOrderHelp: "Este item é vendido mediante reserva antecipada, fora do estoque comum.", postal: "Disponível para envio por correio", postalHelp: "Permite enviar este produto pela Store permanente.", weight: "Peso para envio (g)", weightHelp: "Necessário para frete por peso. Informe o peso aproximado já considerando a embalagem.", reserved: "Reservado", availableAfterReserved: "Disponível após reservas" };

  const updateContent = (language: ProductLanguage, field: keyof ProductContent[ProductLanguage], value: string) => {
    setContent({ ...content, [language]: { ...content[language], [field]: value } });
  };

  const selectableCategories = category && !categories.includes(category) ? [category, ...categories] : categories;
  const costLabel = lang === "ja" ? `原価 (${currency})` : lang === "en" ? `Cost price (${currency})` : `Preço de custo (${currency})`;
  const saleLabel = lang === "ja" ? `販売価格 (${currency})` : lang === "en" ? `Sale price (${currency})` : `Preço de venda (${currency})`;

  return <div className="grid gap-5 sm:grid-cols-2">
    <div className="space-y-1">
      <label htmlFor="product-name" className="text-xs font-black uppercase tracking-wider">{copy.defaultName}</label>
      <input ref={nameInputRef} id="product-name" value={legacyName} onChange={(e) => setLegacyName(e.target.value)} disabled={disabled} className={fieldClass(Boolean(errors.name))} />
      <FieldError message={errors.name} />
    </div>

    <div className="space-y-1">
      <label htmlFor="product-category" className="text-xs font-black uppercase tracking-wider">{t("products.form.category")}</label>
      <select id="product-category" value={creatingCategory ? "__create__" : category} onChange={(e) => { if (e.target.value === "__create__") setCreatingCategory(true); else { setCreatingCategory(false); setCategory(e.target.value); } }} disabled={disabled} className={`${fieldClass(Boolean(errors.category))} h-[46px]`}>
        {selectableCategories.map((item) => <option key={item} value={item}>{item}</option>)}
        <option value="__create__">{categories.length === 0 ? t("products.categories.createFirst") : t("products.categories.createNew")}</option>
      </select>
      {creatingCategory && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder={t("products.categories.placeholder")} disabled={disabled} className={`${fieldClass(Boolean(errors.category))} flex-1`} />
        <button type="button" onClick={onCreateCategory} disabled={disabled || categorySaving} className="min-h-11 rounded-xl bg-black px-4 py-2 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-black">{categorySaving ? copy.creating : t("products.categories.btnCreate")}</button>
      </div>}
      <FieldError message={errors.category} />
    </div>

    <section className="space-y-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800 sm:col-span-2">
      <h3 className="text-sm font-black">{copy.translations}</h3>
      {LANGUAGES.map(({ id, label }) => <div key={id} className="space-y-3 rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-900">
        <p className="text-xs font-black uppercase tracking-wider">{label}</p>
        <input value={content[id].name} onChange={(e) => updateContent(id, "name", e.target.value)} placeholder={copy.defaultName} disabled={disabled} className={fieldClass()} />
        <textarea value={content[id].shortDescription} onChange={(e) => updateContent(id, "shortDescription", e.target.value)} placeholder={copy.short} rows={2} disabled={disabled} className={fieldClass()} />
        <textarea value={content[id].details} onChange={(e) => updateContent(id, "details", e.target.value)} placeholder={copy.details} rows={3} disabled={disabled} className={fieldClass()} />
        <div className="grid gap-3 sm:grid-cols-2">
          <textarea value={content[id].ingredients} onChange={(e) => updateContent(id, "ingredients", e.target.value)} placeholder={copy.ingredients} rows={2} disabled={disabled} className={fieldClass()} />
          <textarea value={content[id].allergens} onChange={(e) => updateContent(id, "allergens", e.target.value)} placeholder={copy.allergens} rows={2} disabled={disabled} className={fieldClass()} />
        </div>
      </div>)}
    </section>

    <div className="space-y-1"><label className="text-xs font-black uppercase tracking-wider">{costLabel}</label><input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="decimal" disabled={disabled} className={fieldClass(Boolean(errors.costPrice))} /><FieldError message={errors.costPrice} /></div>
    <div className="space-y-1"><label className="text-xs font-black uppercase tracking-wider">{saleLabel}</label><input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="decimal" disabled={disabled} className={fieldClass(Boolean(errors.sellPrice))} /><FieldError message={errors.sellPrice} /></div>
    <div className="space-y-1"><label className="text-xs font-black uppercase tracking-wider">{copy.units}</label><input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" disabled={disabled} className={fieldClass(Boolean(errors.quantity))} /><FieldError message={errors.quantity} /></div>
    <div className="space-y-1">
      <label className="text-xs font-black uppercase tracking-wider">{copy.stock}</label>
      <input value={stockQty} onChange={(e) => setStockQty(e.target.value)} inputMode="numeric" disabled={disabled || !inventoryTracked} className={fieldClass(Boolean(errors.stockQty))} />
      {inventoryTracked && reservedStock > 0 && <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">{copy.reserved}: {reservedStock} · {copy.availableAfterReserved}: {Math.max(0, Number(stockQty || 0) - reservedStock)}</p>}
      <FieldError message={errors.stockQty} />
    </div>
    <div className="space-y-1"><label className="text-xs font-black uppercase tracking-wider">{copy.threshold}</label><input value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} inputMode="numeric" disabled={disabled || !inventoryTracked} className={fieldClass(Boolean(errors.lowStockThreshold))} /><FieldError message={errors.lowStockThreshold} /></div>
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 dark:border-neutral-800"><input id="inventory-tracked" type="checkbox" checked={inventoryTracked} onChange={(e) => setInventoryTracked(e.target.checked)} disabled={disabled || reservedStock > 0} /><label htmlFor="inventory-tracked" className="py-3 text-sm font-bold">{copy.track}</label></div>

    <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 sm:col-span-2">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black">{copy.postal}</p>
          <p className="mt-1 text-xs font-semibold text-blue-800/80 dark:text-blue-200/80">{copy.postalHelp}</p>
        </div>
        <input type="checkbox" checked={postalEligible} onChange={(e) => setPostalEligible(e.target.checked)} disabled={disabled} className="h-5 w-5 accent-blue-700" />
      </label>
      {postalEligible && <div className="space-y-1">
        <label className="text-xs font-black uppercase tracking-wider">{copy.weight}</label>
        <input value={shippingWeightGrams} onChange={(e) => setShippingWeightGrams(e.target.value)} inputMode="numeric" disabled={disabled} placeholder="500" className={fieldClass(Boolean(errors.shippingWeightGrams))} />
        <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{copy.weightHelp}</p>
        <FieldError message={errors.shippingWeightGrams} />
      </div>}
    </section>

    <div className="space-y-1 sm:col-span-2">
      <label className="text-xs font-black uppercase tracking-wider">{t("products.form.status")}</label>
      <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} disabled={disabled} className={`${fieldClass()} h-[46px]`}>
        <option value="active">{t("products.badge.active")}</option>
        <option value="made_to_order">{copy.madeToOrder}</option>
        <option value="inactive">{t("products.badge.inactive")}</option>
      </select>
      {status === "made_to_order" && <p className="mt-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">{copy.madeToOrderHelp}</p>}
    </div>

    <div className="space-y-3 sm:col-span-2">
      <label className="text-xs font-black uppercase tracking-wider">{copy.main}</label>
      <div className={`flex flex-col items-center gap-4 rounded-2xl border bg-white p-4 dark:bg-neutral-900 sm:flex-row ${errors.image ? "border-red-400" : "border-neutral-200 dark:border-neutral-800"}`}>
        <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-800">{mainPreview || existingImageUrl ? <img src={mainPreview || existingImageUrl} alt="preview" className="h-full w-full object-cover" /> : <span className="text-[10px] font-bold text-neutral-400">{t("products.select.image")}</span>}</div>
        <input type="file" accept="image/*" onChange={(e) => onPickMain(e.target.files?.[0] || null)} disabled={disabled} className="w-full text-xs" />
      </div><FieldError message={errors.image} />
    </div>

    <div className="space-y-3 sm:col-span-2">
      <label className="text-xs font-black uppercase tracking-wider">{copy.extras}</label>
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <input type="file" accept="image/*" multiple onChange={(e) => onPickExtras(e.target.files)} disabled={disabled} className="w-full text-xs" />
        {existingExtraUrls.length > 0 && <div><p className="mb-2 text-[10px] font-black uppercase text-neutral-400">{copy.current}</p><div className="flex flex-wrap gap-2">{existingExtraUrls.map((url) => <button key={url} type="button" onClick={() => removeExistingExtra(url)} disabled={disabled} className="h-12 w-12 overflow-hidden rounded-xl border"><img src={url} alt="extra" className="h-full w-full object-cover" /></button>)}</div></div>}
        {extraPreviews.length > 0 && <div className="border-t pt-3 dark:border-neutral-800"><div className="mb-2 flex justify-between"><p className="text-[10px] font-black uppercase text-neutral-400">{copy.queue} ({extraPreviews.length})</p><button type="button" onClick={clearSelectedExtras} disabled={disabled} className="text-[10px] font-black uppercase text-red-500 underline">{t("common.clear")}</button></div><div className="flex flex-wrap gap-2">{extraPreviews.map((preview) => <div key={preview} className="h-12 w-12 overflow-hidden rounded-xl border"><img src={preview} alt="selected" className="h-full w-full object-cover" /></div>)}</div></div>}
      </div>
    </div>
  </div>;
}
