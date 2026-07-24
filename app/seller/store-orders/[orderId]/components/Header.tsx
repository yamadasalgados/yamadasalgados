"use client";

import {
  ArrowLeft,
  Copy,
  MessageCircle,
  Printer,
} from "lucide-react";

import {
  formatStoreOrderDate,
  getStatusLabel,
  getStoreOrderText,
  normalizePhoneForWhatsApp,
} from "@/app/lib/store-order-ui";

import type {
  StoreOrder,
  StoreOrderStatus,
} from "@/app/types/store-order";

type Props = {
  order: StoreOrder;
  locale: string;
  onBack: () => void;
};

const STATUS_STYLE: Record<
  StoreOrderStatus,
  string
> = {
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  confirmed:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  made_to_order:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  preparing:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  ready:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  delivered:
    "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200",
  cancelled:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
};

async function copyText(
  value: string,
): Promise<void> {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(
      value,
    );
  } catch {
    const textarea =
      document.createElement(
        "textarea",
      );

    textarea.value = value;
    textarea.style.position =
      "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(
      textarea,
    );

    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export default function Header({
  order,
  locale,
  onBack,
}: Props) {
  const text =
    getStoreOrderText(locale);

  const whatsappPhone =
    normalizePhoneForWhatsApp(
      order.customerPhone,
      locale,
    );

  const neutralButton =
    "inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800";

  return (
    <header className="rounded-3xl border border-neutral-200 bg-white p-5 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 sm:p-7">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className={neutralButton}
          >
            <ArrowLeft size={18} />
            {text.back}
          </button>

          <div className="flex flex-wrap gap-2">
            {order.customerPhone && (
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    order.customerPhone ??
                      "",
                  )
                }
                className={neutralButton}
                title={
                  text.copyPhone
                }
              >
                <Copy size={17} />
                {text.copyPhone}
              </button>
            )}

            {whatsappPhone && (
              <a
                href={`https://wa.me/${whatsappPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200 dark:hover:bg-green-950/70"
              >
                <MessageCircle size={17} />
                {text.whatsapp}
              </a>
            )}

            <button
              type="button"
              onClick={() =>
                window.print()
              }
              className={neutralButton}
            >
              <Printer size={17} />
              {text.print}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {text.order} #
              {order.id
                .slice(0, 10)
                .toUpperCase()}
            </p>

            <h1 className="mt-2 break-words text-3xl font-black">
              {order.customerName ||
                text.noName}
            </h1>

            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {formatStoreOrderDate(
                order.createdAt,
                locale,
              )}
            </p>
          </div>

          <span
            className={[
              "inline-flex w-fit rounded-full border px-4 py-2 text-sm font-black",
              STATUS_STYLE[
                order.status
              ],
            ].join(" ")}
          >
            {getStatusLabel(
              order.status,
              locale,
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
