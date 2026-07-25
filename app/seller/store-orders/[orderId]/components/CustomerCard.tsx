"use client";

import {
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  User,
} from "lucide-react";

import {
  getDeliveryModeLabel,
  getStoreOrderText,
  normalizePhoneForWhatsApp,
} from "@/app/lib/store-order-ui";

import type {
  StoreOrder,
} from "@/app/types/store-order";

type Props = {
  order: StoreOrder;
  locale: string;
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

export default function CustomerCard({
  order,
  locale,
}: Props) {
  const text =
    getStoreOrderText(locale);

  const phone =
    order.customerPhone?.trim() ??
    "";

  const phoneDigits =
    phone.replace(/\D/g, "");

  const whatsappPhone =
    normalizePhoneForWhatsApp(
      phone,
      locale,
    );

  const actionButton =
    "rounded-lg border border-neutral-200 bg-white p-2 text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:bg-neutral-800";

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex items-center gap-3">
        {order.customerPhoto ? (
          <img
            src={order.customerPhoto}
            alt={
              order.customerName ??
              text.customer
            }
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/50">
            <User
              size={28}
              className="text-orange-600 dark:text-orange-300"
            />
          </div>
        )}

        <div className="min-w-0">
          <h2 className="break-words text-2xl font-black">
            {order.customerName ||
              text.noName}
          </h2>

          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {text.customerInfo}
          </p>
        </div>
      </div>

      <div className="mt-7 space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Phone
                className="shrink-0 text-neutral-500 dark:text-neutral-400"
                size={20}
              />

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                  {text.phone}
                </p>

                <p className="break-all font-semibold">
                  {phone || "—"}
                </p>
              </div>
            </div>

            {phone && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      phone,
                    )
                  }
                  className={actionButton}
                  title={text.copy}
                >
                  <Copy size={16} />
                </button>

                <a
                  href={`tel:${phoneDigits}`}
                  className={actionButton}
                  title={text.call}
                >
                  <Phone size={16} />
                </a>
              </div>
            )}
          </div>
        </div>

        {whatsappPhone && (
          <a
            href={`https://wa.me/${whatsappPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:bg-green-50 dark:border-neutral-700 dark:bg-neutral-950/40 dark:hover:bg-green-950/30"
          >
            <div className="flex items-center gap-3">
              <MessageCircle
                className="text-green-600 dark:text-green-300"
                size={20}
              />

              <p className="font-bold">
                {text.whatsapp}
              </p>
            </div>

            <ExternalLink
              size={16}
            />
          </a>
        )}

        {order.customerEmail && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Mail
                  className="shrink-0 text-blue-600 dark:text-blue-300"
                  size={20}
                />

                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                    {text.email}
                  </p>

                  <a
                    href={`mailto:${order.customerEmail}`}
                    className="break-all font-semibold hover:underline"
                  >
                    {order.customerEmail}
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void copyText(
                    order.customerEmail ??
                      "",
                  )
                }
                className={actionButton}
                title={text.copy}
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
              {text.deliveryMode}
            </p>

            <p className="mt-1 font-semibold">
              {getDeliveryModeLabel(
                order.deliveryMode,
                locale,
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
              {text.dateAndTime}
            </p>

            <p className="mt-1 font-semibold">
              {[
                order.deliveryDate,
                order.deliveryTimeSlot,
              ]
                .filter(Boolean)
                .join(" • ") || "—"}
            </p>
          </div>
        </div>

        {order.deliveryMode === "postal" && order.shipping && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/25">
            <div className="flex items-start gap-3">
              <Mail
                className="mt-1 shrink-0 text-sky-600 dark:text-sky-300"
                size={20}
              />

              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase text-sky-700 dark:text-sky-300">
                    {text.recipient}
                  </p>
                  <p className="mt-1 font-black">
                    {order.shipping.recipientName || order.customerName || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-sky-700 dark:text-sky-300">
                    {text.address}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words font-medium">
                    {[
                      order.shipping.postalCode,
                      order.shipping.prefecture,
                      order.shipping.city,
                      order.shipping.addressLine1,
                      order.shipping.addressLine2,
                    ].filter(Boolean).join(" ") || order.address || "—"}
                  </p>
                </div>

                <div className="text-xs font-bold text-sky-800 dark:text-sky-200">
                  {order.shipping.pricingMode === "collect"
                    ? text.shippingCollect
                    : order.shipping.pricingMode === "arrange"
                      ? text.shippingArrange
                      : text.shippingFee}
                  {typeof order.shipping.totalWeightGrams === "number" && (
                    <>
                      {" · "}{text.totalWeight}: {order.shipping.totalWeightGrams >= 1000
                        ? `${(order.shipping.totalWeightGrams / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} kg`
                        : `${order.shipping.totalWeightGrams} g`}
                    </>
                  )}
                </div>

                {order.shipping.instructions && (
                  <p className="whitespace-pre-wrap text-xs text-sky-800 dark:text-sky-200">
                    {order.shipping.instructions}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {order.deliveryMode !== "postal" && (order.address ||
          order.locationLink) && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <MapPin
                  className="mt-1 shrink-0 text-red-500 dark:text-red-300"
                  size={20}
                />

                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
                    {text.address}
                  </p>

                  <p className="whitespace-pre-wrap break-words font-medium">
                    {order.address ||
                      text.openMap}
                  </p>
                </div>
              </div>

              {order.locationLink && (
                <a
                  href={
                    order.locationLink
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={actionButton}
                  title={text.openMap}
                >
                  <ExternalLink
                    size={16}
                  />
                </a>
              )}
            </div>
          </div>
        )}

        {order.note && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/60 dark:bg-yellow-950/30">
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-yellow-300">
              {text.notes}
            </p>

            <p className="mt-2 whitespace-pre-wrap break-words text-neutral-900 dark:text-yellow-100">
              {order.note}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
