"use client";

import {
  ChefHat,
  Printer,
  ReceiptText,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  formatMoneyMajor,
} from "@/app/lib/money";
import {
  getDeliveryModeLabel,
} from "@/app/lib/store-order-ui";
import type {
  StoreOrder,
  StoreOrderItem,
} from "@/app/types/store-order";

type PrintMode =
  | "both"
  | "production"
  | "customer";

type Props = {
  open: boolean;
  order: StoreOrder | null;
  lang: string;
  storeName: string;
  sourceLabel: string;
  onClose: () => void;
};

const COPY = {
  pt: {
    title: "Imprimir pedido",
    subtitle:
      "Pré-visualização em papel térmico de 80 mm.",
    productionCopy: "Via de produção",
    customerCopy: "Via do cliente",
    printBoth: "Imprimir duas vias",
    printProduction: "Somente produção",
    printCustomer: "Somente cliente",
    close: "Fechar",
    order: "Pedido",
    source: "Origem",
    customer: "Cliente",
    phone: "Telefone",
    delivery: "Entrega",
    date: "Data",
    time: "Horário",
    address: "Endereço",
    items: "Itens",
    produce: "PRODUZIR",
    pick: "SEPARAR",
    observations: "Observações",
    payment: "Pagamento",
    subtotal: "Subtotal",
    discount: "Desconto",
    fee: "Taxa/Frete",
    total: "TOTAL",
    thankYou: "Obrigado pela preferência!",
    printedAt: "Impresso em",
    noDate: "A combinar",
    noTime: "A combinar",
    noPayment: "A combinar",
    printerHint:
      "Na janela de impressão, selecione papel 80 mm, escala 100% e margens mínimas.",
  },
  en: {
    title: "Print order",
    subtitle:
      "80 mm thermal paper preview.",
    productionCopy: "Production copy",
    customerCopy: "Customer copy",
    printBoth: "Print both copies",
    printProduction: "Production only",
    printCustomer: "Customer only",
    close: "Close",
    order: "Order",
    source: "Source",
    customer: "Customer",
    phone: "Phone",
    delivery: "Delivery",
    date: "Date",
    time: "Time",
    address: "Address",
    items: "Items",
    produce: "PRODUCE",
    pick: "PICK",
    observations: "Notes",
    payment: "Payment",
    subtotal: "Subtotal",
    discount: "Discount",
    fee: "Fee/Shipping",
    total: "TOTAL",
    thankYou: "Thank you!",
    printedAt: "Printed at",
    noDate: "To be arranged",
    noTime: "To be arranged",
    noPayment: "To be arranged",
    printerHint:
      "In the print dialog, select 80 mm paper, 100% scale, and minimum margins.",
  },
  ja: {
    title: "注文を印刷",
    subtitle:
      "80mm感熱紙のプレビューです。",
    productionCopy: "製造用",
    customerCopy: "お客様用",
    printBoth: "2枚とも印刷",
    printProduction: "製造用のみ",
    printCustomer: "お客様用のみ",
    close: "閉じる",
    order: "注文",
    source: "出所",
    customer: "お客様",
    phone: "電話番号",
    delivery: "受取方法",
    date: "日付",
    time: "時間",
    address: "住所",
    items: "商品",
    produce: "製造",
    pick: "取り分け",
    observations: "備考",
    payment: "支払い",
    subtotal: "小計",
    discount: "割引",
    fee: "配送料",
    total: "合計",
    thankYou: "ありがとうございました！",
    printedAt: "印刷日時",
    noDate: "要相談",
    noTime: "要相談",
    noPayment: "要相談",
    printerHint:
      "印刷画面で80mm用紙、倍率100%、余白最小を選択してください。",
  },
} as const;

function languageKey(
  lang: string,
): keyof typeof COPY {
  if (lang === "ja") return "ja";
  if (lang === "en") return "en";
  return "pt";
}

function localeForLanguage(
  lang: string,
): string {
  if (lang === "ja") return "ja-JP";
  if (lang === "en") return "en-US";
  return "pt-BR";
}

function compactOrderId(
  orderId: string,
): string {
  return orderId.slice(-8).toUpperCase();
}

function itemNeedsProduction(
  item: StoreOrderItem,
): boolean {
  return (
    item.availabilityMode === "made_to_order" ||
    item.stockState === "made_to_order" ||
    (item.inventoryState?.productionRequired ??
      item.productionRequired ??
      0) > 0
  );
}

function orderAddress(
  order: StoreOrder,
): string {
  if (order.address?.trim()) {
    return order.address.trim();
  }

  const shipping = order.shipping;
  if (!shipping) return "";

  return [
    shipping.postalCode,
    shipping.prefecture,
    shipping.city,
    shipping.addressLine1,
    shipping.addressLine2,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function TicketDivider() {
  return (
    <div
      aria-hidden="true"
      className="my-3 border-t border-dashed border-black"
    />
  );
}

function TicketRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 py-0.5 text-[11px] leading-4">
      <span className="font-bold">{label}</span>
      <span
        className={[
          "min-w-0 break-words text-right",
          strong ? "font-black" : "font-medium",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function TicketItems({
  order,
  currencyLocale,
  operational,
  copy,
}: {
  order: StoreOrder;
  currencyLocale: string;
  operational: boolean;
  copy: (typeof COPY)[keyof typeof COPY];
}) {
  return (
    <div className="space-y-2">
      {order.items.map((item, index) => {
        const unitPrice =
          typeof item.price === "number"
            ? item.price
            : item.qty > 0
              ? item.subtotal / item.qty
              : 0;

        return (
          <div
            key={`${item.productId ?? item.id ?? item.name}:${index}`}
            className="break-inside-avoid"
          >
            <div className="flex items-start justify-between gap-2 text-[12px] leading-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5">
                  <span className="shrink-0 font-black">
                    {item.qty}x
                  </span>
                  <span className="font-black">
                    {item.name}
                  </span>
                </div>

                {item.options && item.options.length > 0 && (
                  <p className="mt-0.5 pl-6 text-[10px] leading-3">
                    {item.options
                      .map((option) => `+ ${option.quantity && option.quantity > 0 ? `${option.quantity}x ` : ""}${option.name}`)
                      .join(" · ")}
                  </p>
                )}

                {item.note && (
                  <p className="mt-0.5 pl-6 text-[10px] font-bold leading-3">
                    * {item.note}
                  </p>
                )}
              </div>

              {operational ? (
                <span className="shrink-0 border border-black px-1.5 py-0.5 text-[9px] font-black">
                  {itemNeedsProduction(item)
                    ? copy.produce
                    : copy.pick}
                </span>
              ) : (
                <div className="shrink-0 text-right text-[10px] leading-3">
                  <p>
                    {formatMoneyMajor(
                      unitPrice,
                      order.currency ?? "JPY",
                      currencyLocale,
                    )}
                  </p>
                  <p className="font-black">
                    {formatMoneyMajor(
                      item.subtotal,
                      order.currency ?? "JPY",
                      currencyLocale,
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderPrintDialog({
  open,
  order,
  lang,
  storeName,
  sourceLabel,
  onClose,
}: Props) {
  const key = languageKey(lang);
  const copy = COPY[key];
  const locale = localeForLanguage(lang);
  const [printMode, setPrintMode] =
    useState<PrintMode>("both");
  const [printedAt, setPrintedAt] =
    useState(() => new Date());

  const formattedPrintedAt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(printedAt),
    [locale, printedAt],
  );

  useEffect(() => {
    if (!open) return;

    setPrintMode("both");
    setPrintedAt(new Date());

    const previousOverflow =
      document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose, open]);

  const print = useCallback(
    (mode: PrintMode) => {
      setPrintMode(mode);
      setPrintedAt(new Date());

      window.setTimeout(() => {
        window.print();
      }, 80);
    },
    [],
  );

  if (!open || !order) {
    return null;
  }

  const address = orderAddress(order);
  const deliveryLabel =
    getDeliveryModeLabel(
      order.deliveryMode,
      lang,
    );
  const fee =
    (order.deliveryFee ?? 0) +
    Math.max(
      0,
      (order.shippingFee ?? 0) -
        (order.deliveryFee ?? 0),
    );
  const businessName =
    storeName.trim() ||
    (lang === "ja" ? "店舗" : lang === "en" ? "Store" : "Loja");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-print-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-neutral-100 shadow-2xl dark:bg-neutral-950 sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <h2
              id="order-print-title"
              className="text-xl font-black text-neutral-950 dark:text-white"
            >
              {copy.title}
            </h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {copy.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div
            className="yamada-print-root mx-auto grid max-w-[680px] gap-5 md:grid-cols-2"
            data-print-mode={printMode}
          >
            <article className="yamada-print-ticket yamada-print-production mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-black shadow-lg print:shadow-none">
              <div className="text-center">
                <ChefHat className="mx-auto h-7 w-7" />
                <p className="mt-1 text-[16px] font-black tracking-wider">
                  {copy.productionCopy.toUpperCase()}
                </p>
                <p className="mt-1 text-[11px] font-bold">
                  {businessName}
                </p>
              </div>

              <TicketDivider />

              <TicketRow
                label={copy.order}
                value={`#${compactOrderId(order.id)}`}
                strong
              />
              <TicketRow
                label={copy.source}
                value={sourceLabel}
              />
              <TicketRow
                label={copy.customer}
                value={order.customerName || "—"}
                strong
              />
              <TicketRow
                label={copy.delivery}
                value={deliveryLabel}
              />
              <TicketRow
                label={copy.date}
                value={order.deliveryDate || copy.noDate}
                strong
              />
              <TicketRow
                label={copy.time}
                value={order.deliveryTimeSlot || copy.noTime}
                strong
              />

              <TicketDivider />

              <p className="mb-2 text-center text-[11px] font-black tracking-wider">
                {copy.items.toUpperCase()}
              </p>
              <TicketItems
                order={order}
                currencyLocale={locale}
                operational
                copy={copy}
              />

              {(order.note || address) && (
                <>
                  <TicketDivider />
                  <p className="text-[10px] font-black uppercase">
                    {copy.observations}
                  </p>
                  {order.note && (
                    <p className="mt-1 whitespace-pre-wrap text-[12px] font-black leading-4">
                      {order.note}
                    </p>
                  )}
                  {address && (
                    <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4">
                      {copy.address}: {address}
                    </p>
                  )}
                </>
              )}

              <TicketDivider />
              <p className="text-center text-[9px]">
                {copy.printedAt}: {formattedPrintedAt}
              </p>
            </article>

            <article className="yamada-print-ticket yamada-print-customer mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-black shadow-lg print:shadow-none">
              <div className="text-center">
                <ReceiptText className="mx-auto h-7 w-7" />
                <p className="mt-1 text-[16px] font-black tracking-wider">
                  {businessName}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase">
                  {copy.customerCopy}
                </p>
              </div>

              <TicketDivider />

              <TicketRow
                label={copy.order}
                value={`#${compactOrderId(order.id)}`}
                strong
              />
              <TicketRow
                label={copy.customer}
                value={order.customerName || "—"}
                strong
              />
              <TicketRow
                label={copy.phone}
                value={order.customerPhone || ""}
              />
              <TicketRow
                label={copy.delivery}
                value={deliveryLabel}
              />
              <TicketRow
                label={copy.date}
                value={order.deliveryDate || copy.noDate}
              />
              <TicketRow
                label={copy.time}
                value={order.deliveryTimeSlot || copy.noTime}
              />
              <TicketRow
                label={copy.address}
                value={address}
              />

              <TicketDivider />

              <p className="mb-2 text-center text-[11px] font-black tracking-wider">
                {copy.items.toUpperCase()}
              </p>
              <TicketItems
                order={order}
                currencyLocale={locale}
                operational={false}
                copy={copy}
              />

              <TicketDivider />

              <TicketRow
                label={copy.subtotal}
                value={formatMoneyMajor(
                  order.subtotal ?? 0,
                  order.currency ?? "JPY",
                  locale,
                )}
              />
              {(order.discount ?? 0) > 0 && (
                <TicketRow
                  label={copy.discount}
                  value={`-${formatMoneyMajor(
                    order.discount ?? 0,
                    order.currency ?? "JPY",
                    locale,
                  )}`}
                />
              )}
              {fee > 0 && (
                <TicketRow
                  label={copy.fee}
                  value={formatMoneyMajor(
                    fee,
                    order.currency ?? "JPY",
                    locale,
                  )}
                />
              )}
              <div className="mt-2 flex items-end justify-between gap-3 border-y-2 border-black py-2">
                <span className="text-[13px] font-black">
                  {copy.total}
                </span>
                <span className="text-[17px] font-black">
                  {formatMoneyMajor(
                    order.totalAmount,
                    order.currency ?? "JPY",
                    locale,
                  )}
                </span>
              </div>

              <TicketRow
                label={copy.payment}
                value={order.paymentMethod || copy.noPayment}
              />

              {order.note && (
                <>
                  <TicketDivider />
                  <p className="text-[10px] font-black uppercase">
                    {copy.observations}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] font-bold leading-4">
                    {order.note}
                  </p>
                </>
              )}

              <TicketDivider />
              <p className="text-center text-[11px] font-black">
                {copy.thankYou}
              </p>
              <p className="mt-2 text-center text-[9px]">
                {copy.printedAt}: {formattedPrintedAt}
              </p>
            </article>
          </div>
        </div>

        <footer className="shrink-0 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
          <p className="mb-3 text-center text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            {copy.printerHint}
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.3fr_auto]">
            <button
              type="button"
              onClick={() => print("production")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 px-4 text-xs font-black text-violet-800 transition hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200 dark:hover:bg-violet-950/30"
            >
              <ChefHat className="h-4 w-4" />
              {copy.printProduction}
            </button>
            <button
              type="button"
              onClick={() => print("customer")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-300 px-4 text-xs font-black text-blue-800 transition hover:bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/30"
            >
              <ReceiptText className="h-4 w-4" />
              {copy.printCustomer}
            </button>
            <button
              type="button"
              onClick={() => print("both")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-xs font-black text-white transition hover:opacity-85 dark:bg-white dark:text-black"
            >
              <Printer className="h-4 w-4" />
              {copy.printBoth}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 text-xs font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {copy.close}
            </button>
          </div>
        </footer>
      </section>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 3mm;
          }

          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .yamada-print-root,
          .yamada-print-root * {
            visibility: visible !important;
          }

          .yamada-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            width: 74mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }

          .yamada-print-ticket {
            box-sizing: border-box !important;
            display: block !important;
            width: 74mm !important;
            max-width: 74mm !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 2mm !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          .yamada-print-production {
            break-after: page !important;
            page-break-after: always !important;
          }

          .yamada-print-customer {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .yamada-print-root[data-print-mode="production"]
            .yamada-print-customer,
          .yamada-print-root[data-print-mode="customer"]
            .yamada-print-production {
            display: none !important;
          }

          .yamada-print-root[data-print-mode="production"]
            .yamada-print-production {
            break-after: auto !important;
            page-break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
