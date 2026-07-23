import { Timestamp } from "firebase/firestore";

import { normalizeOrderStatus } from "@/app/lib/order-status";

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
  };
}
