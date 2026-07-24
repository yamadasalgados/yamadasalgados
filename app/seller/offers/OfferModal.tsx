"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type {
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  X,
} from "lucide-react";

import {
  db,
} from "@/app/lib/firebase";
import {
  minorToMajor,
  parseMoneyInputToMinor,
} from "@/app/lib/money";
import {
  emptyOfferContent,
  firestoreValueToDate,
  type OfferContent,
  type OfferDoc,
  type OfferPricingMode,
  type OfferStatus,
} from "@/app/lib/offer-schema";
import type {
  SupportedCurrency,
} from "@/app/types/regional";

import OfferForm, {
  type OfferFormErrors,
  type OfferProductOption,
} from "./OfferForm";

export type OfferSaveResult = {
  mode: "created" | "updated";
  offer: OfferDoc;
};

type Props = {
  open: boolean;
  offer: OfferDoc | null;
  authUser: User;
  sellerId: string;
  products: OfferProductOption[];
  currency: SupportedCurrency;
  locale: string;
  lang: string;
  onClose: () => void;
  onSaved: (
    result: OfferSaveResult,
  ) => void;
};

type Snapshot = {
  content: OfferContent;
  status: OfferStatus;
  selectedProductIds: string[];
  requiredQuantity: string;
  pricingMode: OfferPricingMode;
  regularTotal: string;
  promotionalTotal: string;
  discountAmount: string;
  percentage: string;
  startsAt: string;
  endsAt: string;
};

function snapshotString(
  value: Snapshot,
): string {
  return JSON.stringify({
    ...value,
    selectedProductIds: [
      ...value.selectedProductIds,
    ].sort(),
  });
}

function toDateTimeLocal(
  value: unknown,
): string {
  const date = firestoreValueToDate(value);

  if (!date) return "";

  const offset =
    date.getTimezoneOffset() *
    60_000;

  return new Date(
    date.getTime() - offset,
  )
    .toISOString()
    .slice(0, 16);
}

function fromDateTimeLocal(
  value: string,
): Timestamp | null {
  if (!value.trim()) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : Timestamp.fromDate(date);
}

function focusableElements(
  container: HTMLElement,
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      [
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  ).filter(
    (element) =>
      element.getAttribute(
        "aria-hidden",
      ) !== "true",
  );
}

export default function OfferModal({
  open,
  offer,
  authUser,
  sellerId,
  products,
  currency,
  locale,
  lang,
  onClose,
  onSaved,
}: Props) {
  const dialogRef =
    useRef<HTMLDivElement | null>(null);
  const nameInputRef =
    useRef<HTMLInputElement | null>(null);
  const initialSnapshotRef =
    useRef("");
  const closeTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const [mounted, setMounted] =
    useState(false);
  const [content, setContent] =
    useState<OfferContent>(() =>
      emptyOfferContent(),
    );
  const [status, setStatus] =
    useState<OfferStatus>("active");
  const [selectedProductIds, setSelectedProductIds] =
    useState<string[]>([]);
  const [requiredQuantity, setRequiredQuantity] =
    useState("1");
  const [pricingMode, setPricingMode] =
    useState<OfferPricingMode>(
      "fixed_total",
    );
  const [regularTotal, setRegularTotal] =
    useState("");
  const [promotionalTotal, setPromotionalTotal] =
    useState("");
  const [discountAmount, setDiscountAmount] =
    useState("");
  const [percentage, setPercentage] =
    useState("");
  const [startsAt, setStartsAt] =
    useState("");
  const [endsAt, setEndsAt] =
    useState("");
  const [errors, setErrors] =
    useState<OfferFormErrors>({});
  const [generalError, setGeneralError] =
    useState("");
  const [successMessage, setSuccessMessage] =
    useState("");
  const [saving, setSaving] =
    useState(false);

  const copy = useMemo(
    () =>
      lang === "ja"
        ? {
            newTitle: "新しいオファー",
            editTitle: "オファーを編集",
            help: "対象商品、必要数量、割引方法を設定します。",
            close: "閉じる",
            cancel: "キャンセル",
            save: "保存",
            update: "更新",
            saving: "保存中...",
            created: "オファーを作成しました。",
            updated: "オファーを更新しました。",
            unexpected: "オファーを保存できませんでした。",
            discard: "保存されていない変更を破棄しますか？",
            nameRequired: "少なくとも1つの言語で名前を入力してください。",
            productsRequired: "対象商品を1つ以上選択してください。",
            requiredQuantityInvalid: "必要数量は1以上にしてください。",
            regularInvalid: "通常価格を入力してください。",
            promotionalInvalid: "プロモーション価格を入力してください。",
            promotionalOrder: "プロモーション価格は通常価格より低くしてください。",
            discountInvalid: "割引額を入力してください。",
            percentageInvalid: "割引率は0より大きく100以下にしてください。",
            datesInvalid: "終了日時は開始日時より後にしてください。",
            form: {
              languages: {
                pt: "ポルトガル語",
                en: "英語",
                ja: "日本語",
              },
              name: "名称",
              description: "説明",
              productsTitle: "対象商品",
              productsHelp: "お客様が組み合わせられる商品を選択します。",
              searchProducts: "商品を検索",
              selectedProducts: "選択済み",
              noProducts: "商品がありません。",
              requiredQuantity: "必要数量",
              requiredQuantityHelp: "割引1セットに必要な合計数量です。",
              pricingMode: "価格方式",
              fixedTotal: "セット固定価格",
              fixedDiscount: "固定額割引",
              percentageDiscount: "パーセント割引",
              regularTotal: "通常合計",
              promotionalTotal: "プロモーション合計",
              discountAmount: "割引額",
              percentage: "割引率",
              pricingPreview: "価格プレビュー",
              startsAt: "開始日時",
              endsAt: "終了日時",
              optional: "任意",
              status: "状態",
              active: "有効",
              inactive: "無効",
            },
          }
        : lang === "en"
          ? {
              newTitle: "New Offer",
              editTitle: "Edit Offer",
              help: "Configure eligible products, required quantity, and pricing.",
              close: "Close",
              cancel: "Cancel",
              save: "Save",
              update: "Update",
              saving: "Saving...",
              created: "Offer created successfully.",
              updated: "Offer updated successfully.",
              unexpected: "The offer could not be saved.",
              discard: "Discard unsaved changes?",
              nameRequired: "Enter a name in at least one language.",
              productsRequired: "Select at least one eligible product.",
              requiredQuantityInvalid: "Required quantity must be at least 1.",
              regularInvalid: "Enter the regular total.",
              promotionalInvalid: "Enter the promotional total.",
              promotionalOrder: "Promotional total must be lower than the regular total.",
              discountInvalid: "Enter a discount amount.",
              percentageInvalid: "Percentage must be greater than 0 and at most 100.",
              datesInvalid: "End date must be later than start date.",
              form: {
                languages: {
                  pt: "Portuguese",
                  en: "English",
                  ja: "Japanese",
                },
                name: "Name",
                description: "Description",
                productsTitle: "Eligible products",
                productsHelp: "Choose the products customers may combine in this offer.",
                searchProducts: "Search products",
                selectedProducts: "Selected",
                noProducts: "No products available.",
                requiredQuantity: "Required quantity",
                requiredQuantityHelp: "Total units required for one offer bundle.",
                pricingMode: "Pricing mode",
                fixedTotal: "Fixed bundle total",
                fixedDiscount: "Fixed discount",
                percentageDiscount: "Percentage discount",
                regularTotal: "Regular total",
                promotionalTotal: "Promotional total",
                discountAmount: "Discount amount",
                percentage: "Percentage",
                pricingPreview: "Pricing preview",
                startsAt: "Starts at",
                endsAt: "Ends at",
                optional: "optional",
                status: "Status",
                active: "Active",
                inactive: "Inactive",
              },
            }
          : {
              newTitle: "Nova Oferta",
              editTitle: "Editar Oferta",
              help: "Configure produtos participantes, quantidade obrigatória e preço.",
              close: "Fechar",
              cancel: "Cancelar",
              save: "Salvar",
              update: "Atualizar",
              saving: "Salvando...",
              created: "Oferta criada com sucesso.",
              updated: "Oferta atualizada com sucesso.",
              unexpected: "Não foi possível salvar a oferta.",
              discard: "Deseja descartar as alterações não salvas?",
              nameRequired: "Informe um nome em pelo menos um idioma.",
              productsRequired: "Selecione pelo menos um produto participante.",
              requiredQuantityInvalid: "A quantidade obrigatória deve ser pelo menos 1.",
              regularInvalid: "Informe o valor total normal.",
              promotionalInvalid: "Informe o valor total promocional.",
              promotionalOrder: "O total promocional deve ser menor que o total normal.",
              discountInvalid: "Informe o valor do desconto.",
              percentageInvalid: "O percentual deve ser maior que 0 e no máximo 100.",
              datesInvalid: "O término deve acontecer depois do início.",
              form: {
                languages: {
                  pt: "Português",
                  en: "Inglês",
                  ja: "Japonês",
                },
                name: "Nome",
                description: "Descrição",
                productsTitle: "Produtos participantes",
                productsHelp: "Escolha quais produtos o cliente poderá combinar nesta oferta.",
                searchProducts: "Buscar produtos",
                selectedProducts: "Selecionados",
                noProducts: "Nenhum produto disponível.",
                requiredQuantity: "Quantidade obrigatória",
                requiredQuantityHelp: "Total de unidades necessário para formar um kit da oferta.",
                pricingMode: "Modo de preço",
                fixedTotal: "Preço total fixo",
                fixedDiscount: "Desconto fixo",
                percentageDiscount: "Desconto percentual",
                regularTotal: "Total normal",
                promotionalTotal: "Total promocional",
                discountAmount: "Valor do desconto",
                percentage: "Percentual",
                pricingPreview: "Prévia do preço",
                startsAt: "Início",
                endsAt: "Término",
                optional: "opcional",
                status: "Status",
                active: "Ativa",
                inactive: "Inativa",
              },
            },
    [lang],
  );

  const currentSnapshot = useMemo(
    () =>
      snapshotString({
        content,
        status,
        selectedProductIds,
        requiredQuantity,
        pricingMode,
        regularTotal,
        promotionalTotal,
        discountAmount,
        percentage,
        startsAt,
        endsAt,
      }),
    [
      content,
      discountAmount,
      endsAt,
      percentage,
      pricingMode,
      promotionalTotal,
      regularTotal,
      requiredQuantity,
      selectedProductIds,
      startsAt,
      status,
    ],
  );

  const dirty =
    currentSnapshot !==
    initialSnapshotRef.current;

  const resetForOpen =
    useCallback(() => {
      const next: Snapshot = {
        content:
          offer?.content ??
          emptyOfferContent(),
        status:
          offer?.status ?? "active",
        selectedProductIds:
          offer?.eligibleProductIds ?? [],
        requiredQuantity: String(
          offer?.requiredQuantity ?? 1,
        ),
        pricingMode:
          offer?.pricing.mode ??
          "fixed_total",
        regularTotal:
          offer?.pricing
            .regularTotalMinor === null ||
          offer?.pricing
            .regularTotalMinor === undefined
            ? ""
            : String(
                minorToMajor(
                  offer.pricing
                    .regularTotalMinor,
                  currency,
                ),
              ),
        promotionalTotal:
          offer?.pricing
            .promotionalTotalMinor === null ||
          offer?.pricing
            .promotionalTotalMinor === undefined
            ? ""
            : String(
                minorToMajor(
                  offer.pricing
                    .promotionalTotalMinor,
                  currency,
                ),
              ),
        discountAmount:
          offer?.pricing
            .discountMinor === null ||
          offer?.pricing
            .discountMinor === undefined
            ? ""
            : String(
                minorToMajor(
                  offer.pricing
                    .discountMinor,
                  currency,
                ),
              ),
        percentage:
          offer?.pricing.percentage ===
            null ||
          offer?.pricing.percentage ===
            undefined
            ? ""
            : String(
                offer.pricing.percentage,
              ),
        startsAt: toDateTimeLocal(
          offer?.startsAt,
        ),
        endsAt: toDateTimeLocal(
          offer?.endsAt,
        ),
      };

      setContent(next.content);
      setStatus(next.status);
      setSelectedProductIds(
        next.selectedProductIds,
      );
      setRequiredQuantity(
        next.requiredQuantity,
      );
      setPricingMode(
        next.pricingMode,
      );
      setRegularTotal(
        next.regularTotal,
      );
      setPromotionalTotal(
        next.promotionalTotal,
      );
      setDiscountAmount(
        next.discountAmount,
      );
      setPercentage(next.percentage);
      setStartsAt(next.startsAt);
      setEndsAt(next.endsAt);
      setErrors({});
      setGeneralError("");
      setSuccessMessage("");
      setSaving(false);

      initialSnapshotRef.current =
        snapshotString(next);
    }, [currency, offer]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    resetForOpen();

    const previousOverflow =
      document.body.style.overflow;
    document.body.style.overflow =
      "hidden";

    const timer = window.setTimeout(
      () =>
        nameInputRef.current?.focus(),
      40,
    );

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow =
        previousOverflow;
    };
  }, [open, offer?.id, resetForOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(
          closeTimerRef.current,
        );
      }
    };
  }, []);

  const requestClose =
    useCallback(() => {
      if (saving) return;

      if (
        dirty &&
        !window.confirm(copy.discard)
      ) {
        return;
      }

      onClose();
    }, [
      copy.discard,
      dirty,
      onClose,
      saving,
    ]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (
        event.key !== "Tab" ||
        !dialogRef.current
      ) {
        return;
      }

      const focusable =
        focusableElements(
          dialogRef.current,
        );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last =
        focusable[
          focusable.length - 1
        ];
      const active =
        document.activeElement;

      if (
        event.shiftKey &&
        active === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        active === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () =>
      document.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, [open, requestClose]);

  const selectedProducts = useMemo(
    () =>
      products.filter((product) =>
        selectedProductIds.includes(
          product.id,
        ),
      ),
    [products, selectedProductIds],
  );

  const previewRegularMinor =
    useMemo(() => {
      const required = Math.max(
        1,
        Math.floor(
          Number(requiredQuantity) || 1,
        ),
      );

      if (
        pricingMode === "fixed_total"
      ) {
        return (
          parseMoneyInputToMinor(
            regularTotal,
            currency,
          ) ?? 0
        );
      }

      if (selectedProducts.length === 0) {
        return 0;
      }

      const average =
        selectedProducts.reduce(
          (sum, product) =>
            sum + product.priceMinor,
          0,
        ) /
        selectedProducts.length;

      return Math.max(
        0,
        Math.round(
          average * required,
        ),
      );
    }, [
      currency,
      pricingMode,
      regularTotal,
      requiredQuantity,
      selectedProducts,
    ]);

  const previewDiscountMinor =
    useMemo(() => {
      if (
        pricingMode === "fixed_total"
      ) {
        const promotional =
          parseMoneyInputToMinor(
            promotionalTotal,
            currency,
          ) ?? 0;

        return Math.max(
          0,
          previewRegularMinor -
            promotional,
        );
      }

      if (
        pricingMode ===
        "fixed_discount"
      ) {
        return Math.min(
          previewRegularMinor,
          parseMoneyInputToMinor(
            discountAmount,
            currency,
          ) ?? 0,
        );
      }

      return Math.min(
        previewRegularMinor,
        Math.round(
          previewRegularMinor *
            Math.max(
              0,
              Math.min(
                100,
                Number(percentage) || 0,
              ),
            ) /
            100,
        ),
      );
    }, [
      currency,
      discountAmount,
      percentage,
      pricingMode,
      previewRegularMinor,
      promotionalTotal,
    ]);

  const previewFinalMinor =
    Math.max(
      0,
      previewRegularMinor -
        previewDiscountMinor,
    );

  const validate = useCallback(() => {
    const nextErrors:
      OfferFormErrors = {};

    if (
      !Object.values(content).some(
        (entry) => entry.name.trim(),
      )
    ) {
      nextErrors.name =
        copy.nameRequired;
    }

    if (selectedProductIds.length === 0) {
      nextErrors.products =
        copy.productsRequired;
    }

    const required = Number(
      requiredQuantity,
    );

    if (
      !Number.isInteger(required) ||
      required < 1
    ) {
      nextErrors.requiredQuantity =
        copy.requiredQuantityInvalid;
    }

    let regularMinor: number | null = null;
    let promotionalMinor:
      | number
      | null = null;
    let discountMinor: number | null = null;
    let parsedPercentage:
      | number
      | null = null;

    if (
      pricingMode === "fixed_total"
    ) {
      regularMinor =
        parseMoneyInputToMinor(
          regularTotal,
          currency,
        );
      promotionalMinor =
        parseMoneyInputToMinor(
          promotionalTotal,
          currency,
        );

      if (
        regularMinor === null ||
        regularMinor <= 0
      ) {
        nextErrors.regularTotal =
          copy.regularInvalid;
      }

      if (
        promotionalMinor === null ||
        promotionalMinor <= 0
      ) {
        nextErrors.promotionalTotal =
          copy.promotionalInvalid;
      } else if (
        regularMinor !== null &&
        promotionalMinor >=
          regularMinor
      ) {
        nextErrors.promotionalTotal =
          copy.promotionalOrder;
      }
    } else if (
      pricingMode === "fixed_discount"
    ) {
      discountMinor =
        parseMoneyInputToMinor(
          discountAmount,
          currency,
        );

      if (
        discountMinor === null ||
        discountMinor <= 0
      ) {
        nextErrors.discount =
          copy.discountInvalid;
      }
    } else {
      parsedPercentage = Number(
        percentage,
      );

      if (
        !Number.isFinite(
          parsedPercentage,
        ) ||
        parsedPercentage <= 0 ||
        parsedPercentage > 100
      ) {
        nextErrors.percentage =
          copy.percentageInvalid;
      }
    }

    const startDate = startsAt
      ? new Date(startsAt)
      : null;
    const endDate = endsAt
      ? new Date(endsAt)
      : null;

    if (
      startDate &&
      endDate &&
      endDate.getTime() <=
        startDate.getTime()
    ) {
      nextErrors.dates =
        copy.datesInvalid;
    }

    setErrors(nextErrors);

    return {
      valid:
        Object.keys(nextErrors)
          .length === 0,
      required:
        Number.isInteger(required) &&
        required > 0
          ? required
          : 1,
      regularMinor,
      promotionalMinor,
      discountMinor,
      percentage:
        parsedPercentage,
    };
  }, [
    content,
    copy.datesInvalid,
    copy.discountInvalid,
    copy.nameRequired,
    copy.percentageInvalid,
    copy.productsRequired,
    copy.promotionalInvalid,
    copy.promotionalOrder,
    copy.regularInvalid,
    copy.requiredQuantityInvalid,
    currency,
    discountAmount,
    endsAt,
    percentage,
    pricingMode,
    promotionalTotal,
    regularTotal,
    requiredQuantity,
    selectedProductIds.length,
    startsAt,
  ]);

  const handleSubmit =
    useCallback(async () => {
      if (saving) return;

      const validation = validate();

      if (!validation.valid) {
        return;
      }

      setSaving(true);
      setGeneralError("");
      setSuccessMessage("");

      try {
        const payload = {
          schemaVersion: 2 as const,
          content,
          status,
          eligibleProductIds:
            Array.from(
              new Set(
                selectedProductIds,
              ),
            ),
          requiredQuantity:
            validation.required,
          pricing: {
            mode: pricingMode,
            regularTotalMinor:
              pricingMode ===
              "fixed_total"
                ? validation.regularMinor
                : null,
            promotionalTotalMinor:
              pricingMode ===
              "fixed_total"
                ? validation.promotionalMinor
                : null,
            discountMinor:
              pricingMode ===
              "fixed_discount"
                ? validation.discountMinor
                : null,
            percentage:
              pricingMode ===
              "percentage_discount"
                ? validation.percentage
                : null,
          },
          startsAt:
            fromDateTimeLocal(
              startsAt,
            ),
          endsAt:
            fromDateTimeLocal(endsAt),
          updatedAt:
            serverTimestamp(),
          updatedBy: authUser.uid,
        };

        let result: OfferSaveResult;
        const localTimestamp =
          Timestamp.now();

        if (offer) {
          await updateDoc(
            doc(
              db,
              "sellers",
              sellerId,
              "offers",
              offer.id,
            ),
            payload,
          );

          result = {
            mode: "updated",
            offer: {
              ...offer,
              ...payload,
              updatedAt:
                localTimestamp,
            },
          };
        } else {
          const reference = await addDoc(
            collection(
              db,
              "sellers",
              sellerId,
              "offers",
            ),
            {
              ...payload,
              createdAt:
                serverTimestamp(),
              createdBy: authUser.uid,
            },
          );

          result = {
            mode: "created",
            offer: {
              id: reference.id,
              ...payload,
              createdAt:
                localTimestamp,
              updatedAt:
                localTimestamp,
              createdBy: authUser.uid,
            },
          };
        }

        initialSnapshotRef.current =
          currentSnapshot;
        setSuccessMessage(
          result.mode === "created"
            ? copy.created
            : copy.updated,
        );
        onSaved(result);

        closeTimerRef.current =
          setTimeout(() => {
            onClose();
          }, 650);
      } catch (error) {
        console.error(
          "[OfferModal] save:",
          error,
        );
        setGeneralError(
          copy.unexpected,
        );
      } finally {
        setSaving(false);
      }
    }, [
      authUser.uid,
      content,
      copy.created,
      copy.unexpected,
      copy.updated,
      currentSnapshot,
      endsAt,
      offer,
      onClose,
      onSaved,
      pricingMode,
      saving,
      selectedProductIds,
      sellerId,
      startsAt,
      status,
      validate,
    ]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-stretch justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-modal-title"
        aria-describedby="offer-modal-description"
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-neutral-50 text-neutral-950 shadow-2xl dark:bg-neutral-950 dark:text-white sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-[900px] sm:rounded-[2rem] sm:border sm:border-neutral-200 sm:dark:border-neutral-800"
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
          <div>
            <h2
              id="offer-modal-title"
              className="text-xl font-black sm:text-2xl"
            >
              {offer
                ? copy.editTitle
                : copy.newTitle}
            </h2>
            <p
              id="offer-modal-description"
              className="mt-1 text-xs font-medium text-neutral-500"
            >
              {copy.help}
            </p>
          </div>

          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label={copy.close}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
            <div className="space-y-5">
              {generalError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                >
                  <AlertTriangle
                    size={20}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{generalError}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
                >
                  <CheckCircle2
                    size={20}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{successMessage}</span>
                </div>
              )}

              <OfferForm
                copy={copy.form}
                currency={currency}
                locale={locale}
                disabled={
                  saving ||
                  Boolean(successMessage)
                }
                nameInputRef={nameInputRef}
                errors={errors}
                products={products}
                content={content}
                onContentChange={(value) => {
                  setContent(value);
                  setErrors((current) => ({
                    ...current,
                    name: undefined,
                  }));
                }}
                selectedProductIds={
                  selectedProductIds
                }
                onSelectedProductIdsChange={(value) => {
                  setSelectedProductIds(value);
                  setErrors((current) => ({
                    ...current,
                    products: undefined,
                  }));
                }}
                requiredQuantity={
                  requiredQuantity
                }
                onRequiredQuantityChange={(value) => {
                  setRequiredQuantity(value);
                  setErrors((current) => ({
                    ...current,
                    requiredQuantity:
                      undefined,
                  }));
                }}
                pricingMode={pricingMode}
                onPricingModeChange={
                  setPricingMode
                }
                regularTotal={regularTotal}
                onRegularTotalChange={(value) => {
                  setRegularTotal(value);
                  setErrors((current) => ({
                    ...current,
                    regularTotal: undefined,
                  }));
                }}
                promotionalTotal={
                  promotionalTotal
                }
                onPromotionalTotalChange={(value) => {
                  setPromotionalTotal(value);
                  setErrors((current) => ({
                    ...current,
                    promotionalTotal:
                      undefined,
                  }));
                }}
                discountAmount={discountAmount}
                onDiscountAmountChange={(value) => {
                  setDiscountAmount(value);
                  setErrors((current) => ({
                    ...current,
                    discount: undefined,
                  }));
                }}
                percentage={percentage}
                onPercentageChange={(value) => {
                  setPercentage(value);
                  setErrors((current) => ({
                    ...current,
                    percentage: undefined,
                  }));
                }}
                startsAt={startsAt}
                onStartsAtChange={(value) => {
                  setStartsAt(value);
                  setErrors((current) => ({
                    ...current,
                    dates: undefined,
                  }));
                }}
                endsAt={endsAt}
                onEndsAtChange={(value) => {
                  setEndsAt(value);
                  setErrors((current) => ({
                    ...current,
                    dates: undefined,
                  }));
                }}
                status={status}
                onStatusChange={setStatus}
                previewRegularMinor={
                  previewRegularMinor
                }
                previewDiscountMinor={
                  previewDiscountMinor
                }
                previewFinalMinor={
                  previewFinalMinor
                }
              />
            </div>
          </div>

          <footer className="sticky bottom-0 z-10 flex shrink-0 flex-col-reverse gap-3 border-t border-neutral-200 bg-white px-4 py-4 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-5 text-sm font-black transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {copy.cancel}
            </button>

            <button
              type="submit"
              disabled={
                saving ||
                Boolean(successMessage)
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {saving ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <Save size={17} />
              )}
              {saving
                ? copy.saving
                : offer
                  ? copy.update
                  : copy.save}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
