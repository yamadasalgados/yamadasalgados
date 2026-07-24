"use client";

import {
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  CalendarDays,
  Check,
  Percent,
  Search,
  Tag,
} from "lucide-react";

import {
  formatMoneyMinor,
} from "@/app/lib/money";
import type {
  OfferContent,
  OfferLanguage,
  OfferPricingMode,
  OfferStatus,
} from "@/app/lib/offer-schema";
import type {
  SupportedCurrency,
} from "@/app/types/regional";

export type OfferProductOption = {
  id: string;
  name: string;
  priceMinor: number;
  imageUrl: string;
  active: boolean;
};

export type OfferFormErrors = {
  name?: string;
  products?: string;
  requiredQuantity?: string;
  regularTotal?: string;
  promotionalTotal?: string;
  discount?: string;
  percentage?: string;
  dates?: string;
};

type Copy = {
  languages: Record<
    OfferLanguage,
    string
  >;
  name: string;
  description: string;
  productsTitle: string;
  productsHelp: string;
  searchProducts: string;
  selectedProducts: string;
  noProducts: string;
  requiredQuantity: string;
  requiredQuantityHelp: string;
  pricingMode: string;
  fixedTotal: string;
  fixedDiscount: string;
  percentageDiscount: string;
  regularTotal: string;
  promotionalTotal: string;
  discountAmount: string;
  percentage: string;
  pricingPreview: string;
  startsAt: string;
  endsAt: string;
  optional: string;
  status: string;
  active: string;
  inactive: string;
};

type Props = {
  copy: Copy;
  currency: SupportedCurrency;
  locale: string;
  disabled: boolean;
  nameInputRef: RefObject<
    HTMLInputElement | null
  >;
  errors: OfferFormErrors;
  products: OfferProductOption[];
  content: OfferContent;
  onContentChange: (
    content: OfferContent,
  ) => void;
  selectedProductIds: string[];
  onSelectedProductIdsChange: (
    ids: string[],
  ) => void;
  requiredQuantity: string;
  onRequiredQuantityChange: (
    value: string,
  ) => void;
  pricingMode: OfferPricingMode;
  onPricingModeChange: (
    value: OfferPricingMode,
  ) => void;
  regularTotal: string;
  onRegularTotalChange: (
    value: string,
  ) => void;
  promotionalTotal: string;
  onPromotionalTotalChange: (
    value: string,
  ) => void;
  discountAmount: string;
  onDiscountAmountChange: (
    value: string,
  ) => void;
  percentage: string;
  onPercentageChange: (
    value: string,
  ) => void;
  startsAt: string;
  onStartsAtChange: (
    value: string,
  ) => void;
  endsAt: string;
  onEndsAtChange: (
    value: string,
  ) => void;
  status: OfferStatus;
  onStatusChange: (
    value: OfferStatus,
  ) => void;
  previewRegularMinor: number;
  previewDiscountMinor: number;
  previewFinalMinor: number;
};

const LANGUAGE_ORDER:
  OfferLanguage[] = [
    "pt",
    "en",
    "ja",
  ];

export default function OfferForm({
  copy,
  currency,
  locale,
  disabled,
  nameInputRef,
  errors,
  products,
  content,
  onContentChange,
  selectedProductIds,
  onSelectedProductIdsChange,
  requiredQuantity,
  onRequiredQuantityChange,
  pricingMode,
  onPricingModeChange,
  regularTotal,
  onRegularTotalChange,
  promotionalTotal,
  onPromotionalTotalChange,
  discountAmount,
  onDiscountAmountChange,
  percentage,
  onPercentageChange,
  startsAt,
  onStartsAtChange,
  endsAt,
  onEndsAtChange,
  status,
  onStatusChange,
  previewRegularMinor,
  previewDiscountMinor,
  previewFinalMinor,
}: Props) {
  const [language, setLanguage] =
    useState<OfferLanguage>("pt");
  const [productSearch, setProductSearch] =
    useState("");

  const selected = new Set(
    selectedProductIds,
  );
  const normalizedSearch =
    productSearch
      .trim()
      .toLocaleLowerCase(locale);
  const visibleProducts = products.filter(
    (product) =>
      !normalizedSearch ||
      product.name
        .toLocaleLowerCase(locale)
        .includes(normalizedSearch),
  );

  const fieldClass =
    "min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950";

  const currentContent =
    content[language];

  return (
    <div className="space-y-7">
      <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_ORDER.map(
            (languageId) => (
              <button
                key={languageId}
                type="button"
                disabled={disabled}
                onClick={() =>
                  setLanguage(languageId)
                }
                className={[
                  "min-h-10 rounded-xl border px-4 text-xs font-black transition",
                  language === languageId
                    ? "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300",
                ].join(" ")}
              >
                {copy.languages[languageId]}
              </button>
            ),
          )}
        </div>

        <Field
          label={copy.name}
          error={errors.name}
        >
          <input
            ref={
              language === "pt"
                ? nameInputRef
                : undefined
            }
            value={currentContent.name}
            onChange={(event) =>
              onContentChange({
                ...content,
                [language]: {
                  ...currentContent,
                  name: event.target.value,
                },
              })
            }
            disabled={disabled}
            className={fieldClass}
            maxLength={120}
          />
        </Field>

        <Field
          label={copy.description}
        >
          <textarea
            value={
              currentContent.description
            }
            onChange={(event) =>
              onContentChange({
                ...content,
                [language]: {
                  ...currentContent,
                  description:
                    event.target.value,
                },
              })
            }
            disabled={disabled}
            className={`${fieldClass} min-h-28 py-3`}
            maxLength={600}
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <div>
          <h3 className="text-lg font-black">
            {copy.productsTitle}
          </h3>
          <p className="mt-1 text-xs font-medium text-neutral-500">
            {copy.productsHelp}
          </p>
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-950">
          <Search
            size={18}
            className="text-neutral-400"
          />
          <input
            value={productSearch}
            onChange={(event) =>
              setProductSearch(
                event.target.value,
              )
            }
            disabled={disabled}
            placeholder={copy.searchProducts}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

        <p className="text-xs font-black text-neutral-500">
          {copy.selectedProducts}: {selected.size}
        </p>

        {errors.products && (
          <p className="text-xs font-bold text-red-600 dark:text-red-300">
            {errors.products}
          </p>
        )}

        {visibleProducts.length === 0 ? (
          <p className="rounded-2xl bg-neutral-50 p-5 text-center text-sm text-neutral-500 dark:bg-neutral-950/50">
            {copy.noProducts}
          </p>
        ) : (
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {visibleProducts.map(
              (product) => {
                const checked =
                  selected.has(product.id);

                return (
                  <label
                    key={product.id}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition",
                      checked
                        ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                        : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900",
                      !product.active
                        ? "opacity-60"
                        : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={
                        disabled ||
                        !product.active
                      }
                      onChange={() => {
                        const next = new Set(
                          selectedProductIds,
                        );

                        if (checked) {
                          next.delete(product.id);
                        } else {
                          next.add(product.id);
                        }

                        onSelectedProductIdsChange(
                          Array.from(next),
                        );
                      }}
                      className="sr-only"
                    />

                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                        <Tag size={19} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">
                        {product.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-500">
                        {formatMoneyMinor(
                          product.priceMinor,
                          currency,
                          locale,
                        )}
                      </p>
                    </div>

                    <span
                      className={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                        checked
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-neutral-300 text-transparent dark:border-neutral-700",
                      ].join(" ")}
                    >
                      <Check size={15} />
                    </span>
                  </label>
                );
              },
            )}
          </div>
        )}
      </section>

      <section className="grid gap-5 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5 lg:grid-cols-2">
        <Field
          label={copy.requiredQuantity}
          help={copy.requiredQuantityHelp}
          error={errors.requiredQuantity}
        >
          <input
            type="number"
            min="1"
            step="1"
            value={requiredQuantity}
            onChange={(event) =>
              onRequiredQuantityChange(
                event.target.value,
              )
            }
            disabled={disabled}
            className={fieldClass}
          />
        </Field>

        <Field label={copy.status}>
          <select
            value={status}
            onChange={(event) =>
              onStatusChange(
                event.target.value ===
                  "inactive"
                  ? "inactive"
                  : "active",
              )
            }
            disabled={disabled}
            className={fieldClass}
          >
            <option value="active">
              {copy.active}
            </option>
            <option value="inactive">
              {copy.inactive}
            </option>
          </select>
        </Field>
      </section>

      <section className="space-y-5 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <Field label={copy.pricingMode}>
          <select
            value={pricingMode}
            onChange={(event) =>
              onPricingModeChange(
                event.target.value as
                  OfferPricingMode,
              )
            }
            disabled={disabled}
            className={fieldClass}
          >
            <option value="fixed_total">
              {copy.fixedTotal}
            </option>
            <option value="fixed_discount">
              {copy.fixedDiscount}
            </option>
            <option value="percentage_discount">
              {copy.percentageDiscount}
            </option>
          </select>
        </Field>

        {pricingMode === "fixed_total" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={copy.regularTotal}
              error={errors.regularTotal}
            >
              <input
                inputMode="decimal"
                value={regularTotal}
                onChange={(event) =>
                  onRegularTotalChange(
                    event.target.value,
                  )
                }
                disabled={disabled}
                className={fieldClass}
              />
            </Field>

            <Field
              label={copy.promotionalTotal}
              error={errors.promotionalTotal}
            >
              <input
                inputMode="decimal"
                value={promotionalTotal}
                onChange={(event) =>
                  onPromotionalTotalChange(
                    event.target.value,
                  )
                }
                disabled={disabled}
                className={fieldClass}
              />
            </Field>
          </div>
        )}

        {pricingMode === "fixed_discount" && (
          <Field
            label={copy.discountAmount}
            error={errors.discount}
          >
            <input
              inputMode="decimal"
              value={discountAmount}
              onChange={(event) =>
                onDiscountAmountChange(
                  event.target.value,
                )
              }
              disabled={disabled}
              className={fieldClass}
            />
          </Field>
        )}

        {pricingMode === "percentage_discount" && (
          <Field
            label={copy.percentage}
            error={errors.percentage}
          >
            <div className="relative">
              <input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={percentage}
                onChange={(event) =>
                  onPercentageChange(
                    event.target.value,
                  )
                }
                disabled={disabled}
                className={`${fieldClass} pr-12`}
              />
              <Percent
                size={18}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400"
              />
            </div>
          </Field>
        )}

        <div className="rounded-2xl bg-neutral-950 p-4 text-white dark:bg-white dark:text-neutral-950">
          <p className="text-xs font-black uppercase tracking-wider opacity-60">
            {copy.pricingPreview}
          </p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="opacity-60">
                {copy.regularTotal}
              </p>
              <p className="mt-1 font-black">
                {formatMoneyMinor(
                  previewRegularMinor,
                  currency,
                  locale,
                )}
              </p>
            </div>
            <div>
              <p className="opacity-60">
                {copy.discountAmount}
              </p>
              <p className="mt-1 font-black">
                - {formatMoneyMinor(
                  previewDiscountMinor,
                  currency,
                  locale,
                )}
              </p>
            </div>
            <div>
              <p className="opacity-60">
                {copy.promotionalTotal}
              </p>
              <p className="mt-1 font-black">
                {formatMoneyMinor(
                  previewFinalMinor,
                  currency,
                  locale,
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <div className="flex items-center gap-2">
          <CalendarDays
            size={20}
            className="text-orange-600"
          />
          <h3 className="text-lg font-black">
            {copy.startsAt} / {copy.endsAt}
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`${copy.startsAt} (${copy.optional})`}
          >
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) =>
                onStartsAtChange(
                  event.target.value,
                )
              }
              disabled={disabled}
              className={fieldClass}
            />
          </Field>

          <Field
            label={`${copy.endsAt} (${copy.optional})`}
            error={errors.dates}
          >
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) =>
                onEndsAtChange(
                  event.target.value,
                )
              }
              disabled={disabled}
              className={fieldClass}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-black uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
        {label}
      </span>
      {children}
      {help && !error && (
        <span className="block text-xs font-medium text-neutral-500">
          {help}
        </span>
      )}
      {error && (
        <span className="block text-xs font-bold text-red-600 dark:text-red-300">
          {error}
        </span>
      )}
    </label>
  );
}

