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

export type ReceiptTypography = {
  base: number;
  storeTitle: number;
  copyTitle: number;
  sectionTitle: number;
  orderId: number;
  small: number;
  badge: number;
  itemName: number;
  note: number;
};

export type ReceiptCopySettings = {
  typography: ReceiptTypography;
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
  schemaVersion: 2;
  production: ReceiptCopySettings;
  customer: ReceiptCopySettings;
};

export const DEFAULT_PRINT_TYPOGRAPHY: ReceiptTypography = {
  base: 10.5, storeTitle: 18, copyTitle: 12, sectionTitle: 10,
  orderId: 22, small: 8, badge: 7, itemName: 11, note: 10.5,
};

export const DEFAULT_PRODUCTION_RECEIPT_SETTINGS: ReceiptCopySettings = {
  typography: { ...DEFAULT_PRINT_TYPOGRAPHY },
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
  typography: { ...DEFAULT_PRINT_TYPOGRAPHY },
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
  schemaVersion: 2,
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

export function normalizeReceiptTypography(value: unknown): ReceiptTypography {
  const raw = asRecord(value);
  const result = { ...DEFAULT_PRINT_TYPOGRAPHY };
  for (const key of Object.keys(result) as Array<keyof ReceiptTypography>) {
    const num = Number(raw[key]);
    if (raw[key] !== undefined && raw[key] !== null && Number.isFinite(num)) {
      result[key] = Math.min(32, Math.max(6, Math.round(num * 2) / 2));
    }
  }
  return result;
}

export function normalizeReceiptCopySettings(
  value: unknown,
  defaults: ReceiptCopySettings,
): ReceiptCopySettings {
  const raw = asRecord(value);

  return {
    typography: normalizeReceiptTypography(raw.typography),
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
    schemaVersion: 2,
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
