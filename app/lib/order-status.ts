export const ORDER_STATUS = [
  "pending",
  "confirmed",
  "made_to_order",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus =
  (typeof ORDER_STATUS)[number];

export type OrderLanguage =
  | "pt"
  | "en"
  | "ja";

const OPEN_STATUS = new Set<OrderStatus>([
  "pending",
  "confirmed",
  "made_to_order",
  "preparing",
  "ready",
]);

const LABELS: Record<
  OrderLanguage,
  Record<OrderStatus, string>
> = {
  pt: {
    pending: "Pendente",
    confirmed: "Confirmado",
    made_to_order: "Encomenda",
    preparing: "Em preparação",
    ready: "Pronto",
    delivered: "Entregue",
    cancelled: "Cancelado",
  },
  en: {
    pending: "Pending",
    confirmed: "Confirmed",
    made_to_order: "Made to order",
    preparing: "Preparing",
    ready: "Ready",
    delivered: "Delivered",
    cancelled: "Cancelled",
  },
  ja: {
    pending: "保留中",
    confirmed: "確認済み",
    made_to_order: "受注生産",
    preparing: "準備中",
    ready: "準備完了",
    delivered: "配達済み",
    cancelled: "キャンセル",
  },
};

export function normalizeOrderLanguage(
  value?: string,
): OrderLanguage {
  const normalized =
    value?.toLowerCase() ?? "";

  if (
    normalized === "en" ||
    normalized.startsWith("en-")
  ) {
    return "en";
  }

  if (
    normalized === "ja" ||
    normalized.startsWith("ja-")
  ) {
    return "ja";
  }

  return "pt";
}

export function normalizeOrderStatus(
  value: unknown,
): OrderStatus {
  switch (value) {
    case "pending":
    case "confirmed":
    case "made_to_order":
    case "preparing":
    case "ready":
    case "delivered":
    case "cancelled":
      return value;

    // Compatibilidade com documentos antigos.
    case "ordered":
    case "preorder":
    case "custom_order":
      return "made_to_order";

    case "delivering":
      return "ready";

    case "completed":
      return "delivered";

    default:
      return "pending";
  }
}

export function isOpenOrderStatus(
  value: unknown,
): boolean {
  return OPEN_STATUS.has(
    normalizeOrderStatus(value),
  );
}

export function getOrderStatusLabel(
  status: OrderStatus,
  languageOrLocale?: string,
): string {
  return LABELS[
    normalizeOrderLanguage(
      languageOrLocale,
    )
  ][status];
}
