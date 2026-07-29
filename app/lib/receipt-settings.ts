export type ReceiptQrDestination =
  | "seller_order"
  | "customer_tracking"
  | "store"
  | "custom";

export type ReceiptCheckboxStyle =
  | "square"
  | "brackets"
  | "circle"
  | "line";

export type ReceiptCopySettings = {
  showLogo: boolean;
  showHeaderText: boolean;
  showFooterText: boolean;
  checkboxEnabled: boolean;
  checkboxStyle: ReceiptCheckboxStyle;
  qrEnabled: boolean;
  qrDestination: ReceiptQrDestination;
  qrCustomUrl: string;
  qrLabel: string;
};

export type ReceiptSettings = {
  schemaVersion: 1;
  production: ReceiptCopySettings;
  customer: ReceiptCopySettings;
};

export const DEFAULT_PRODUCTION_RECEIPT_SETTINGS: ReceiptCopySettings = {
  showLogo: true,
  showHeaderText: true,
  showFooterText: false,
  checkboxEnabled: true,
  checkboxStyle: "square",
  qrEnabled: false,
  qrDestination: "seller_order",
  qrCustomUrl: "",
  qrLabel: "Abrir pedido no painel",
};

export const DEFAULT_CUSTOMER_RECEIPT_SETTINGS: ReceiptCopySettings = {
  showLogo: true,
  showHeaderText: true,
  showFooterText: true,
  checkboxEnabled: false,
  checkboxStyle: "square",
  qrEnabled: false,
  qrDestination: "customer_tracking",
  qrCustomUrl: "",
  qrLabel: "Acompanhar pedido",
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  schemaVersion: 1,
  production: DEFAULT_PRODUCTION_RECEIPT_SETTINGS,
  customer: DEFAULT_CUSTOMER_RECEIPT_SETTINGS,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeDestination(value: unknown, fallback: ReceiptQrDestination): ReceiptQrDestination {
  return value === "seller_order" ||
    value === "customer_tracking" ||
    value === "store" ||
    value === "custom"
    ? value
    : fallback;
}

function normalizeCheckboxStyle(value: unknown): ReceiptCheckboxStyle {
  return value === "brackets" || value === "circle" || value === "line"
    ? value
    : "square";
}

export function normalizeReceiptCopySettings(
  value: unknown,
  defaults: ReceiptCopySettings,
): ReceiptCopySettings {
  const raw = asRecord(value);

  return {
    showLogo: raw.showLogo !== false,
    showHeaderText: raw.showHeaderText !== false,
    showFooterText: typeof raw.showFooterText === "boolean"
      ? raw.showFooterText
      : defaults.showFooterText,
    checkboxEnabled: typeof raw.checkboxEnabled === "boolean"
      ? raw.checkboxEnabled
      : defaults.checkboxEnabled,
    checkboxStyle: normalizeCheckboxStyle(raw.checkboxStyle),
    qrEnabled: raw.qrEnabled === true,
    qrDestination: normalizeDestination(raw.qrDestination, defaults.qrDestination),
    qrCustomUrl: cleanString(raw.qrCustomUrl, 1500),
    qrLabel: cleanString(raw.qrLabel, 120) || defaults.qrLabel,
  };
}

export function normalizeReceiptSettings(value: unknown): ReceiptSettings {
  const raw = asRecord(value);

  return {
    schemaVersion: 1,
    production: normalizeReceiptCopySettings(
      raw.production,
      DEFAULT_PRODUCTION_RECEIPT_SETTINGS,
    ),
    customer: normalizeReceiptCopySettings(
      raw.customer,
      DEFAULT_CUSTOMER_RECEIPT_SETTINGS,
    ),
  };
}

export function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function receiptCheckboxGlyph(style: ReceiptCheckboxStyle): string {
  if (style === "brackets") return "[ ]";
  if (style === "circle") return "○";
  if (style === "line") return "____";
  return "□";
}
