import { Timestamp } from "firebase/firestore";

import { normalizeOrderStatus } from "@/app/lib/order-status";

import type {
  AppliedOfferSnapshot,
  OfferPricingMode,
} from "@/app/lib/offer-schema";

import type {
  StoreOrder,
  StoreOrderDate,
  StoreOrderDeliveryMode,
  StoreOrderHistory,
  StoreOrderItem,
  StoreOrderOption,
  StoreOrderStatus,
  StoreOrderTimestampLike,
} from "@/app/types/store-order";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function toSafeString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export function toSafeNumber(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(
      value.replace(",", "."),
    );

    return Number.isFinite(normalized)
      ? normalized
      : 0;
  }

  return 0;
}

function toOptionalNumber(
  value: unknown,
): number | undefined {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(
      value.replace(",", "."),
    );

    return Number.isFinite(normalized)
      ? normalized
      : undefined;
  }

  return undefined;
}

export function normalizeStoreOrderStatus(
  value: unknown,
): StoreOrderStatus {
  return normalizeOrderStatus(value);
}

export function normalizeDeliveryMode(
  value: unknown,
): StoreOrderDeliveryMode {
  if (
    value === "pickup" ||
    value === "delivery" ||
    value === "none"
  ) {
    return value;
  }

  return "none";
}

function normalizeOption(
  value: unknown,
): StoreOrderOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const name =
    toSafeString(value.name) ||
    toSafeString(value.label);

  if (!name) {
    return null;
  }

  return {
    id:
      toSafeString(value.id) ||
      undefined,
    name,
    price: toOptionalNumber(value.price),
  };
}

export function normalizeStoreOrderItems(
  value: unknown,
): StoreOrderItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((rawItem): StoreOrderItem | null => {
      if (!isRecord(rawItem)) {
        return null;
      }

      const name =
        toSafeString(rawItem.name) ||
        toSafeString(rawItem.productName);

      if (!name) {
        return null;
      }

      const qty = Math.max(
        0,
        toSafeNumber(
          rawItem.qty ??
            rawItem.quantity,
        ),
      );

      const price = toOptionalNumber(
        rawItem.price ??
          rawItem.unitPrice,
      );

      const savedSubtotal =
        toOptionalNumber(
          rawItem.subtotal ??
            rawItem.total,
        );

      const subtotal =
        savedSubtotal ??
        qty * (price ?? 0);

      const options = Array.isArray(
        rawItem.options,
      )
        ? rawItem.options
            .map(normalizeOption)
            .filter(
              (
                option,
              ): option is StoreOrderOption =>
                option !== null,
            )
        : [];

      return {
        id:
          toSafeString(rawItem.id) ||
          undefined,
        productId:
          toSafeString(
            rawItem.productId,
          ) || undefined,
        sku:
          toSafeString(rawItem.sku) ||
          undefined,
        name,
        qty,
        price,
        subtotal,
        category:
          toSafeString(
            rawItem.category,
          ) || undefined,
        imageUrl:
          toSafeString(
            rawItem.imageUrl ??
              rawItem.image,
          ) || undefined,
        note:
          toSafeString(
            rawItem.note ??
              rawItem.notes,
          ) || undefined,
        availabilityMode:
          rawItem.availabilityMode === "made_to_order" ||
          rawItem.availabilityStatus === "made_to_order" ||
          rawItem.productionMode === "made_to_order"
            ? "made_to_order"
            : "normal",
        stockAvailable:
          rawItem.stockAvailable === null
            ? null
            : toOptionalNumber(rawItem.stockAvailable),
        stockShortage:
          Math.max(0, toSafeNumber(rawItem.stockShortage)),
        stockState:
          rawItem.stockState === "insufficient" ||
          rawItem.stockState === "not_tracked" ||
          rawItem.stockState === "made_to_order"
            ? rawItem.stockState
            : "available",
        options:
          options.length > 0
            ? options
            : undefined,
      };
    })
    .filter(
      (
        item,
      ): item is StoreOrderItem =>
        item !== null,
    );
}

export function normalizeStoreOrderHistory(
  value: unknown,
): StoreOrderHistory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (
        rawEntry,
      ): StoreOrderHistory | null => {
        if (!isRecord(rawEntry)) {
          return null;
        }

        return {
          status:
            normalizeStoreOrderStatus(
              rawEntry.status,
            ),
          createdAt:
            normalizeStoreOrderDate(
              rawEntry.createdAt,
            ),
          updatedBy:
            toSafeString(
              rawEntry.updatedBy,
            ) || undefined,
          note:
            toSafeString(
              rawEntry.note,
            ) || undefined,
        };
      },
    )
    .filter(
      (
        entry,
      ): entry is StoreOrderHistory =>
        entry !== null,
    );
}

function isStoreOrderTimestampLike(
  value: unknown,
): value is StoreOrderTimestampLike {
  if (!isRecord(value)) {
    return false;
  }

  const candidate: Record<
    string,
    unknown
  > = value;

  return (
    typeof candidate.toDate ===
    "function"
  );
}

export function normalizeStoreOrderDate(
  value: unknown,
): StoreOrderDate | undefined {
  if (
    value instanceof Timestamp ||
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    value === null
  ) {
    return value;
  }

  if (
    isStoreOrderTimestampLike(value)
  ) {
    return value;
  }

  return undefined;
}

export function storeOrderDateToDate(
  value: StoreOrderDate | undefined,
): Date | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime(),
    )
      ? null
      : value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    isStoreOrderTimestampLike(value)
  ) {
    const date = value.toDate();

    return date instanceof Date &&
      !Number.isNaN(date.getTime())
      ? date
      : null;
  }

  const date = new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

export function storeOrderDateToMillis(
  value: StoreOrderDate | undefined,
): number {
  return (
    storeOrderDateToDate(
      value,
    )?.getTime() ?? 0
  );
}

function normalizeAppliedOffers(
  value: unknown,
): AppliedOfferSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((raw): AppliedOfferSnapshot | null => {
      if (!isRecord(raw)) {
        return null;
      }

      const offerId =
        toSafeString(raw.offerId);
      const name =
        toSafeString(raw.name);
      const pricingMode:
        OfferPricingMode =
        raw.pricingMode ===
          "fixed_discount" ||
        raw.pricingMode ===
          "percentage_discount"
          ? raw.pricingMode
          : "fixed_total";
      const requiredQuantity =
        Math.max(
          1,
          Math.floor(
            toSafeNumber(
              raw.requiredQuantity,
            ) || 1,
          ),
        );
      const bundleCount =
        Math.max(
          1,
          Math.floor(
            toSafeNumber(
              raw.bundleCount,
            ) || 1,
          ),
        );

      if (!offerId || !name) {
        return null;
      }

      const selectedItems =
        Array.isArray(raw.selectedItems)
          ? raw.selectedItems
              .map((item) => {
                if (!isRecord(item)) {
                  return null;
                }

                const productId =
                  toSafeString(
                    item.productId,
                  );
                const quantity =
                  Math.max(
                    0,
                    Math.floor(
                      toSafeNumber(
                        item.quantity,
                      ),
                    ),
                  );
                const priceMinor =
                  Math.max(
                    0,
                    Math.round(
                      toSafeNumber(
                        item.priceMinor,
                      ),
                    ),
                  );

                return productId &&
                  quantity > 0
                  ? {
                      productId,
                      quantity,
                      priceMinor,
                    }
                  : null;
              })
              .filter(
                (
                  item,
                ): item is {
                  productId: string;
                  quantity: number;
                  priceMinor: number;
                } => item !== null,
              )
          : [];

      return {
        offerId,
        name,
        pricingMode,
        requiredQuantity,
        bundleCount,
        configuredRegularTotalMinor:
          toOptionalNumber(
            raw.configuredRegularTotalMinor,
          ) ?? null,
        configuredPromotionalTotalMinor:
          toOptionalNumber(
            raw.configuredPromotionalTotalMinor,
          ) ?? null,
        configuredDiscountMinor:
          toOptionalNumber(
            raw.configuredDiscountMinor,
          ) ?? null,
        configuredPercentage:
          toOptionalNumber(
            raw.configuredPercentage,
          ) ?? null,
        regularAmountMinor:
          Math.max(
            0,
            Math.round(
              toSafeNumber(
                raw.regularAmountMinor,
              ),
            ),
          ),
        discountAmountMinor:
          Math.max(
            0,
            Math.round(
              toSafeNumber(
                raw.discountAmountMinor,
              ),
            ),
          ),
        finalAmountMinor:
          Math.max(
            0,
            Math.round(
              toSafeNumber(
                raw.finalAmountMinor,
              ),
            ),
          ),
        selectedItems,
      };
    })
    .filter(
      (
        offer,
      ): offer is AppliedOfferSnapshot =>
        offer !== null,
    );
}

export function parseStoreOrder(
  id: string,
  data: Record<string, unknown>,
): StoreOrder {
  const items =
    normalizeStoreOrderItems(
      data.items,
    );

  const itemsSubtotal =
    items.reduce(
      (sum, item) =>
        sum + item.subtotal,
      0,
    );

  const subtotal =
    toOptionalNumber(
      data.subtotal,
    ) ?? itemsSubtotal;

  const discount =
    toOptionalNumber(
      data.discount,
    ) ?? 0;

  const deliveryFee =
    toOptionalNumber(
      data.deliveryFee,
    ) ?? 0;

  const totalAmount =
    toOptionalNumber(
      data.totalAmount ??
        data.total ??
        data.grandTotal,
    ) ??
    Math.max(
      0,
      subtotal +
        deliveryFee -
        discount,
    );

  return {
    id,

    customerName:
      toSafeString(
        data.customerName,
      ) ||
      toSafeString(data.name) ||
      toSafeString(
        data.clientName,
      ) ||
      undefined,

    customerPhone:
      toSafeString(
        data.customerPhone,
      ) ||
      toSafeString(data.phone) ||
      undefined,

    customerEmail:
      toSafeString(
        data.customerEmail,
      ) ||
      toSafeString(data.email) ||
      undefined,

    customerPhoto:
      toSafeString(
        data.customerPhoto,
      ) || undefined,

    note:
      toSafeString(data.note) ||
      toSafeString(data.notes) ||
      toSafeString(
        data.observation,
      ) ||
      undefined,

    deliveryMode:
      normalizeDeliveryMode(
        data.deliveryMode,
      ),

    deliveryDate:
      toSafeString(
        data.deliveryDate,
      ) ||
      toSafeString(data.date) ||
      undefined,

    deliveryTimeSlot:
      toSafeString(
        data.deliveryTimeSlot,
      ) ||
      toSafeString(
        data.timeOption,
      ) ||
      toSafeString(
        data.deliveryTime,
      ) ||
      undefined,

    locationLink:
      toSafeString(
        data.locationLink,
      ) ||
      toSafeString(data.mapUrl) ||
      undefined,

    address:
      toSafeString(data.address) ||
      undefined,

    paymentMethod:
      toSafeString(
        data.paymentMethod,
      ) || undefined,

    paymentStatus:
      toSafeString(
        data.paymentStatus,
      ) || undefined,

    subtotal,
    discount,
    deliveryFee,
    totalAmount,

    createdAt:
      normalizeStoreOrderDate(
        data.createdAt,
      ),

    updatedAt:
      normalizeStoreOrderDate(
        data.updatedAt,
      ),

    sellerReadAt:
      normalizeStoreOrderDate(
        data.sellerReadAt,
      ),

    sellerUnread:
      data.sellerUnread === true,

    updatedBy:
      toSafeString(
        data.updatedBy,
      ) || undefined,

    status:
      normalizeStoreOrderStatus(
        data.status,
      ),

    items,

    history:
      normalizeStoreOrderHistory(
        data.history,
      ),

    offersApplied:
      normalizeAppliedOffers(
        data.offersApplied,
      ),
  };
}
