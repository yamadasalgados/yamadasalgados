import {
  Gift,
  Package,
} from "lucide-react";

import {
  formatStoreOrderCurrency,
  getStoreOrderText,
} from "@/app/lib/store-order-ui";

import type {
  StoreOrder,
} from "@/app/types/store-order";

type Props = {
  order?: StoreOrder | null;
  locale: string;
};

export default function ItemsCard({
  order,
  locale,
}: Props) {
  const text =
    getStoreOrderText(locale);

  const items =
    Array.isArray(order?.items)
      ? order.items
      : [];

  const offersApplied =
    Array.isArray(order?.offersApplied)
      ? order.offersApplied
      : [];

  const offersTitle =
    locale.startsWith("ja")
      ? "適用されたオファー"
      : locale.startsWith("en")
        ? "Applied offers"
        : "Ofertas aplicadas";

  const totalItems =
    items.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(item.qty) || 0,
        ),
      0,
    );

  const itemsSubtotal =
    items.reduce(
      (sum, item) =>
        sum +
        (Number(item.subtotal) ||
          0),
      0,
    );

  const subtotal =
    order?.subtotal ??
    itemsSubtotal;

  const discount =
    order?.discount ?? 0;

  const shippingFee =
    order?.shippingFee ??
    order?.shipping?.shippingFee ??
    order?.deliveryFee ??
    0;

  const total =
    order?.totalAmount ??
    Math.max(
      0,
      subtotal +
        shippingFee -
        discount,
    );

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Package
            className="text-orange-600 dark:text-orange-300"
            size={25}
          />

          <h2 className="text-2xl font-black">
            {text.products}
          </h2>
        </div>

        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-bold dark:bg-neutral-800">
          {totalItems}{" "}
          {totalItems === 1
            ? text.item
            : text.items}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-7 rounded-2xl bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:bg-neutral-950/50 dark:text-neutral-400">
          {text.noItems}
        </p>
      ) : (
        <div className="mt-7 divide-y divide-neutral-200 dark:divide-neutral-800">
          {items.map(
            (
              item,
              index,
            ) => {
              const subtotalValue =
                Number(
                  item.subtotal,
                ) ||
                Math.max(
                  0,
                  Number(item.qty) ||
                    0,
                ) *
                  (Number(
                    item.price,
                  ) || 0);

              return (
                <article
                  key={
                    item.id ??
                    item.productId ??
                    `${item.name}-${index}`
                  }
                  className="flex gap-4 py-5 first:pt-0 last:pb-0"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-16 w-16 shrink-0 rounded-xl border border-neutral-200 object-cover dark:border-neutral-700"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                      <Package
                        size={22}
                        className="text-neutral-400"
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="break-words font-black">
                          {item.qty}×{" "}
                          {item.name}
                        </h3>

                        {item.category && (
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {item.category}
                          </p>
                        )}

                        {item.availabilityMode === "made_to_order" && (
                          <span className="mt-2 inline-flex rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {locale.startsWith("ja") ? "受注生産" : locale.startsWith("en") ? "Made to order" : "Sob encomenda"}
                          </span>
                        )}

                        {(item.stockShortage ?? 0) > 0 && (
                          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                            {locale.startsWith("ja")
                              ? `在庫不足: ${item.stockShortage}`
                              : locale.startsWith("en")
                                ? `Stock shortage: ${item.stockShortage}`
                                : `Falta no estoque: ${item.stockShortage}`}
                          </p>
                        )}
                      </div>

                      <p className="shrink-0 font-black">
                        {formatStoreOrderCurrency(
                          subtotalValue,
                          locale,
                          order?.currency,
                        )}
                      </p>
                    </div>

                    {item.options &&
                      item.options.length >
                        0 && (
                        <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                          {item.options.map(
                            (
                              option,
                              optionIndex,
                            ) => (
                              <li
                                key={
                                  option.id ??
                                  `${option.name}-${optionIndex}`
                                }
                              >
                                +{" "}
                                {option.name}
                                {typeof option.price ===
                                "number"
                                  ? ` (${formatStoreOrderCurrency(
                                      option.price,
                                      locale,
                                      order?.currency,
                                    )})`
                                  : ""}
                              </li>
                            ),
                          )}
                        </ul>
                      )}

                    {item.note && (
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-yellow-50 p-2 text-sm text-neutral-900 dark:bg-yellow-950/30 dark:text-yellow-100">
                        {item.note}
                      </p>
                    )}
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}

      {offersApplied.length > 0 && (
        <div className="mt-7 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
          <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
            <Gift size={18} />
            <h3 className="text-sm font-black">
              {offersTitle}
            </h3>
          </div>

          <div className="mt-3 space-y-2">
            {offersApplied.map((offer) => (
              <div
                key={offer.offerId}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="font-bold">
                  {offer.name} · {offer.bundleCount}×
                </span>
                <span className="font-black text-green-700 dark:text-green-300">
                  - {formatStoreOrderCurrency(
                    discount > 0 &&
                    offersApplied.length === 1
                      ? discount
                      : 0,
                    locale,
                    order?.currency,
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-7 space-y-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
        <SummaryRow
          label={text.subtotal}
          value={formatStoreOrderCurrency(
            subtotal,
            locale,
            order?.currency,
          )}
        />

        {discount > 0 && (
          <SummaryRow
            label={text.discount}
            value={`- ${formatStoreOrderCurrency(
              discount,
              locale,
              order?.currency,
            )}`}
          />
        )}

        {order?.deliveryMode === "postal" ? (
          <SummaryRow
            label={
              order.shipping?.pricingMode === "collect"
                ? text.shippingCollect
                : order.shipping?.pricingMode === "arrange"
                  ? text.shippingArrange
                  : text.shippingFee
            }
            value={
              shippingFee > 0
                ? formatStoreOrderCurrency(shippingFee, locale, order?.currency)
                : "—"
            }
          />
        ) : shippingFee > 0 ? (
          <SummaryRow
            label={text.deliveryFee}
            value={formatStoreOrderCurrency(shippingFee, locale, order?.currency)}
          />
        ) : null}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4 text-xl font-black dark:border-neutral-800">
          <span>{text.total}</span>

          <span>
            {formatStoreOrderCurrency(
              total,
              locale,
              order?.currency,
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-neutral-500 dark:text-neutral-400">
        {label}
      </span>

      <span className="font-bold">
        {value}
      </span>
    </div>
  );
}
