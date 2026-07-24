"use client";

import type {
  RefObject,
} from "react";

import type {
  SupportedCurrency,
} from "@/app/types/regional";

import type {
  ProductFormErrors,
  ProductStatus,
} from "./product-types";

type ProductFormProps = {
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

  name: string;
  setName: (value: string) => void;
  costPrice: string;
  setCostPrice: (value: string) => void;
  sellPrice: string;
  setSellPrice: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  stockQty: string;
  setStockQty: (value: string) => void;
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

function FieldError({
  message,
}: {
  message?: string;
}) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="mt-1 text-xs font-bold text-red-600 dark:text-red-300"
    >
      {message}
    </p>
  );
}

function fieldClass(hasError: boolean): string {
  return [
    "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition",
    "dark:bg-neutral-900 dark:text-white",
    hasError
      ? "border-red-400 focus:ring-2 focus:ring-red-400 dark:border-red-700"
      : "border-neutral-200 focus:ring-2 focus:ring-black dark:border-neutral-800 dark:focus:ring-white",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" ");
}

export default function ProductForm({
  t,
  lang,
  currency,
  disabled,
  categorySaving,
  nameInputRef,
  errors,
  categories,
  category,
  setCategory,
  creatingCategory,
  setCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  onCreateCategory,
  name,
  setName,
  costPrice,
  setCostPrice,
  sellPrice,
  setSellPrice,
  quantity,
  setQuantity,
  stockQty,
  setStockQty,
  status,
  setStatus,
  existingImageUrl,
  existingExtraUrls,
  mainPreview,
  extraPreviews,
  onPickMain,
  onPickExtras,
  removeExistingExtra,
  clearSelectedExtras,
}: ProductFormProps) {
  const copy =
    lang === "ja"
      ? {
          units: "販売単位",
          stock: "利用可能な総在庫",
          mainMedia: "商品のメインメディア",
          extraMedia: "追加画像のギャラリー",
          currentMedia: "現在のメディア（クリックして削除）",
          queue: "アップロードキュー",
          creatingCategory: "作成中...",
        }
      : lang === "en"
        ? {
            units: "Units per sale",
            stock: "Total available stock",
            mainMedia: "Main product media",
            extraMedia: "Extra images gallery",
            currentMedia: "Current media (click to remove)",
            queue: "Upload queue",
            creatingCategory: "Creating...",
          }
        : {
            units: "Unidades por venda",
            stock: "Estoque total disponível",
            mainMedia: "Mídia principal do produto",
            extraMedia: "Galeria de imagens extras",
            currentMedia: "Mídias atuais (clique para remover)",
            queue: "Fila de upload",
            creatingCategory: "Criando...",
          };

  const costLabel =
    lang === "ja"
      ? `原価 (${currency})`
      : lang === "en"
        ? `Cost price (${currency})`
        : `Preço de custo (${currency})`;

  const saleLabel =
    lang === "ja"
      ? `販売価格 (${currency})`
      : lang === "en"
        ? `Sale price (${currency})`
        : `Preço de venda (${currency})`;

  const selectableCategories =
    category && !categories.includes(category)
      ? [category, ...categories]
      : categories;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-1">
        <label
          htmlFor="product-name"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {t("products.form.name")}
        </label>
        <input
          ref={nameInputRef}
          id="product-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "product-name-error" : undefined}
          autoComplete="off"
          className={fieldClass(Boolean(errors.name))}
        />
        <div id="product-name-error">
          <FieldError message={errors.name} />
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="product-category"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {t("products.form.category")}
        </label>
        <select
          id="product-category"
          value={creatingCategory ? "__create__" : category}
          onChange={(event) => {
            if (event.target.value === "__create__") {
              setCreatingCategory(true);
              return;
            }

            setCreatingCategory(false);
            setCategory(event.target.value);
          }}
          disabled={disabled}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? "product-category-error" : undefined}
          className={`${fieldClass(Boolean(errors.category))} h-[46px]`}
        >
          {selectableCategories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value="__create__">
            {categories.length === 0
              ? t("products.categories.createFirst")
              : t("products.categories.createNew")}
          </option>
        </select>

        {creatingCategory && (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder={t("products.categories.placeholder")}
              disabled={disabled}
              className={`${fieldClass(Boolean(errors.category))} flex-1`}
            />
            <button
              type="button"
              onClick={onCreateCategory}
              disabled={disabled || categorySaving}
              className="min-h-11 rounded-xl bg-black px-4 py-2 text-xs font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {categorySaving
                ? copy.creatingCategory
                : t("products.categories.btnCreate")}
            </button>
          </div>
        )}

        <div id="product-category-error">
          <FieldError message={errors.category} />
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="product-cost-price"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {costLabel}
        </label>
        <input
          id="product-cost-price"
          value={costPrice}
          onChange={(event) => setCostPrice(event.target.value)}
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={Boolean(errors.costPrice)}
          className={fieldClass(Boolean(errors.costPrice))}
        />
        <FieldError message={errors.costPrice} />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="product-sale-price"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {saleLabel}
        </label>
        <input
          id="product-sale-price"
          value={sellPrice}
          onChange={(event) => setSellPrice(event.target.value)}
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={Boolean(errors.sellPrice)}
          className={fieldClass(Boolean(errors.sellPrice))}
        />
        <FieldError message={errors.sellPrice} />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="product-units"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {copy.units}
        </label>
        <input
          id="product-units"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="numeric"
          disabled={disabled}
          aria-invalid={Boolean(errors.quantity)}
          className={fieldClass(Boolean(errors.quantity))}
        />
        <FieldError message={errors.quantity} />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="product-stock"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {copy.stock}
        </label>
        <input
          id="product-stock"
          value={stockQty}
          onChange={(event) => setStockQty(event.target.value)}
          inputMode="numeric"
          disabled={disabled}
          aria-invalid={Boolean(errors.stockQty)}
          className={fieldClass(Boolean(errors.stockQty))}
        />
        <FieldError message={errors.stockQty} />
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label
          htmlFor="product-status"
          className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {t("products.form.status")}
        </label>
        <select
          id="product-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ProductStatus)}
          disabled={disabled}
          className={`${fieldClass(false)} h-[46px]`}
        >
          <option value="active">{t("products.badge.active")}</option>
          <option value="inactive">{t("products.badge.inactive")}</option>
        </select>
      </div>

      <div className="space-y-3 sm:col-span-2">
        <label className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
          {copy.mainMedia}
        </label>
        <div
          className={`flex flex-col items-center gap-4 rounded-2xl border bg-white p-4 dark:bg-neutral-900 sm:flex-row ${
            errors.image
              ? "border-red-400 dark:border-red-700"
              : "border-neutral-200 dark:border-neutral-800"
          }`}
        >
          <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
            {mainPreview || existingImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mainPreview || existingImageUrl}
                alt="preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-tight text-neutral-400">
                {t("products.select.image")}
              </span>
            )}
          </div>
          <div className="w-full space-y-1">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => onPickMain(event.target.files?.[0] || null)}
              disabled={disabled}
              className="w-full text-xs"
            />
            <p className="text-[10px] font-medium leading-tight text-neutral-400">
              {t("products.form.imageHint")}
            </p>
          </div>
        </div>
        <FieldError message={errors.image} />
      </div>

      <div className="space-y-3 sm:col-span-2">
        <label className="text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
          {copy.extraMedia}
        </label>
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => onPickExtras(event.target.files)}
            disabled={disabled}
            className="w-full text-xs"
          />

          {existingExtraUrls.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                {copy.currentMedia}:
              </p>
              <div className="flex flex-wrap gap-2">
                {existingExtraUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => removeExistingExtra(url)}
                    disabled={disabled}
                    className="h-12 w-12 overflow-hidden rounded-xl border border-neutral-200 transition hover:opacity-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700"
                    aria-label="Remove image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="extra"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {extraPreviews.length > 0 && (
            <div className="space-y-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                  {copy.queue} ({extraPreviews.length})
                </p>
                <button
                  type="button"
                  onClick={clearSelectedExtras}
                  disabled={disabled}
                  className="text-[10px] font-black uppercase text-red-500 underline disabled:opacity-50"
                >
                  {t("common.clear")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {extraPreviews.map((preview) => (
                  <div
                    key={preview}
                    className="h-12 w-12 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="selected"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
