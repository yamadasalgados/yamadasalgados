import type {
  StoreOrderDeliveryMode,
  StoreOrderErrorCode,
  StoreOrderStatus,
} from "@/app/types/store-order";

import {
  storeOrderDateToDate,
} from "@/app/lib/store-order";

import {
  getOrderStatusLabel,
} from "@/app/lib/order-status";

export type StoreOrderLanguage =
  | "pt"
  | "en"
  | "ja";

export const STORE_ORDER_LOCALES: Record<
  StoreOrderLanguage,
  string
> = {
  pt: "pt-BR",
  en: "en-US",
  ja: "ja-JP",
};

export function getStoreOrderLanguage(
  localeOrLanguage?: string,
): StoreOrderLanguage {
  const value =
    localeOrLanguage?.toLowerCase() ??
    "";

  if (
    value === "en" ||
    value.startsWith("en-")
  ) {
    return "en";
  }

  if (
    value === "ja" ||
    value.startsWith("ja-")
  ) {
    return "ja";
  }

  return "pt";
}

export const STORE_ORDER_TEXT = {
  pt: {
    retry: "Tentar novamente",
    back: "Voltar",
    print: "Imprimir",
    copyPhone: "Copiar telefone",
    whatsapp: "WhatsApp",
    order: "Pedido",
    customer: "Cliente",
    customerInfo: "Informações do cliente",
    noName: "Cliente sem nome",
    phone: "Telefone",
    email: "E-mail",
    address: "Endereço",
    notes: "Observações",
    openMap: "Abrir localização",
    call: "Ligar",
    copy: "Copiar",
    products: "Produtos",
    noItems: "Nenhum produto encontrado neste pedido.",
    item: "item",
    items: "itens",
    subtotal: "Subtotal",
    discount: "Desconto",
    deliveryFee: "Taxa de entrega",
    total: "Total",
    history: "Histórico",
    historyEmpty: "Nenhuma alteração registrada.",
    statusActions: "Alterar status",
    statusHelp: "Selecione o novo estágio do pedido.",
    statusNote: "Observação da alteração (opcional)",
    saving: "Salvando...",
    confirmCancel: "Deseja realmente cancelar este pedido?",
    notFound: "Pedido não encontrado",
    notFoundBody:
      "O pedido não existe ou esta conta não possui permissão para visualizá-lo.",
    deliveryMode: "Forma de entrega",
    dateAndTime: "Data e horário",
    pickup: "Retirada",
    delivery: "Entrega",
    none: "A combinar",
    authRequired: "Você precisa entrar na conta do vendedor.",
    invalidOrderId: "O identificador do pedido é inválido.",
    orderLoadFailed:
      "Não foi possível carregar o pedido. Verifique a conexão e as permissões.",
    statusUpdateFailed:
      "Não foi possível alterar o status do pedido. Tente novamente.",
  },
  en: {
    retry: "Try again",
    back: "Back",
    print: "Print",
    copyPhone: "Copy phone",
    whatsapp: "WhatsApp",
    order: "Order",
    customer: "Customer",
    customerInfo: "Customer information",
    noName: "Unnamed customer",
    phone: "Phone",
    email: "Email",
    address: "Address",
    notes: "Notes",
    openMap: "Open location",
    call: "Call",
    copy: "Copy",
    products: "Products",
    noItems: "No products were found in this order.",
    item: "item",
    items: "items",
    subtotal: "Subtotal",
    discount: "Discount",
    deliveryFee: "Delivery fee",
    total: "Total",
    history: "History",
    historyEmpty: "No changes have been recorded.",
    statusActions: "Change status",
    statusHelp: "Select the new order stage.",
    statusNote: "Change note (optional)",
    saving: "Saving...",
    confirmCancel: "Do you really want to cancel this order?",
    notFound: "Order not found",
    notFoundBody:
      "The order does not exist or this account cannot access it.",
    deliveryMode: "Delivery method",
    dateAndTime: "Date and time",
    pickup: "Pickup",
    delivery: "Delivery",
    none: "To be arranged",
    authRequired: "You must sign in to the seller account.",
    invalidOrderId: "The order identifier is invalid.",
    orderLoadFailed:
      "The order could not be loaded. Check the connection and permissions.",
    statusUpdateFailed:
      "The order status could not be changed. Try again.",
  },
  ja: {
    retry: "再試行",
    back: "戻る",
    print: "印刷",
    copyPhone: "電話番号をコピー",
    whatsapp: "WhatsApp",
    order: "注文",
    customer: "お客様",
    customerInfo: "お客様情報",
    noName: "名前なし",
    phone: "電話番号",
    email: "メール",
    address: "住所",
    notes: "備考",
    openMap: "位置情報を開く",
    call: "電話する",
    copy: "コピー",
    products: "商品",
    noItems: "この注文に商品がありません。",
    item: "点",
    items: "点",
    subtotal: "小計",
    discount: "割引",
    deliveryFee: "配送料",
    total: "合計",
    history: "履歴",
    historyEmpty: "変更履歴はありません。",
    statusActions: "ステータス変更",
    statusHelp: "注文の新しい段階を選択してください。",
    statusNote: "変更メモ（任意）",
    saving: "保存中...",
    confirmCancel: "この注文をキャンセルしますか？",
    notFound: "注文が見つかりません",
    notFoundBody:
      "注文が存在しないか、このアカウントに閲覧権限がありません。",
    deliveryMode: "受取方法",
    dateAndTime: "日時",
    pickup: "受取",
    delivery: "配達",
    none: "要相談",
    authRequired: "販売者アカウントにログインしてください。",
    invalidOrderId: "注文IDが無効です。",
    orderLoadFailed:
      "注文を読み込めませんでした。接続と権限を確認してください。",
    statusUpdateFailed:
      "注文ステータスを変更できませんでした。もう一度お試しください。",
  },
} as const;

export function getStoreOrderText(
  localeOrLanguage?: string,
) {
  return STORE_ORDER_TEXT[
    getStoreOrderLanguage(
      localeOrLanguage,
    )
  ];
}

export function getStoreOrderLocale(
  localeOrLanguage?: string,
): string {
  return STORE_ORDER_LOCALES[
    getStoreOrderLanguage(
      localeOrLanguage,
    )
  ];
}

export function getStoreOrderErrorText(
  errorCode:
    | StoreOrderErrorCode
    | null
    | undefined,
  localeOrLanguage?: string,
): string {
  if (!errorCode) {
    return "";
  }

  const text =
    getStoreOrderText(
      localeOrLanguage,
    );

  switch (errorCode) {
    case "AUTH_REQUIRED":
      return text.authRequired;
    case "INVALID_ORDER_ID":
      return text.invalidOrderId;
    case "ORDER_NOT_FOUND":
      return text.notFound;
    case "ORDER_LOAD_FAILED":
      return text.orderLoadFailed;
    case "STATUS_UPDATE_FAILED":
      return text.statusUpdateFailed;
    default:
      return text.orderLoadFailed;
  }
}

export function getStatusLabel(
  status: StoreOrderStatus,
  localeOrLanguage?: string,
): string {
  return getOrderStatusLabel(
    status,
    localeOrLanguage,
  );
}

export function getDeliveryModeLabel(
  mode: StoreOrderDeliveryMode | undefined,
  localeOrLanguage?: string,
): string {
  const text =
    getStoreOrderText(
      localeOrLanguage,
    );

  if (mode === "pickup") {
    return text.pickup;
  }

  if (mode === "delivery") {
    return text.delivery;
  }

  return text.none;
}

export function formatStoreOrderCurrency(
  value: number | undefined,
  localeOrLanguage?: string,
): string {
  return new Intl.NumberFormat(
    getStoreOrderLocale(
      localeOrLanguage,
    ),
    {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    },
  ).format(value ?? 0);
}

export function formatStoreOrderDate(
  value: Parameters<
    typeof storeOrderDateToDate
  >[0],
  localeOrLanguage?: string,
): string {
  const date =
    storeOrderDateToDate(value);

  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    getStoreOrderLocale(
      localeOrLanguage,
    ),
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

export function normalizePhoneForWhatsApp(
  phone: string | undefined,
  localeOrLanguage?: string,
): string {
  const digits = (
    phone ?? ""
  ).replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (
    getStoreOrderLanguage(
      localeOrLanguage,
    ) === "ja" &&
    digits.startsWith("0")
  ) {
    return `81${digits.slice(1)}`;
  }

  return digits;
}
