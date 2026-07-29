import { auth } from "@/app/lib/firebase";

export type PublicOrderSource = "store" | "event";
export type PublicOrderLanguage = "pt" | "en" | "ja";
export type PublicOrderDeliveryMode = "pickup" | "delivery" | "postal" | "none";
export type PublicOrderRewardMode = "none" | "discount" | "product";

export type PublicOrderErrorCode =
  | "INVALID_REQUEST"
  | "SELLER_UNAVAILABLE"
  | "EVENT_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "OFFER_UNAVAILABLE"
  | "SHIPPING_UNAVAILABLE"
  | "FULFILLMENT_DATE_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "IDEMPOTENCY_CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "NETWORK_ERROR"
  | "AUTH_REQUIRED"
  | "REWARDS_UNAVAILABLE"
  | "INSUFFICIENT_POINTS"
  | "UNKNOWN_ERROR";

export type CreatePublicOrderInput = {
  source: PublicOrderSource;
  sellerId: string;
  eventId?: string;
  language: PublicOrderLanguage;
  selectedOfferId?: string;
  customerClientId?: string;
  quantities: Record<string, number>;
  pricing?: Record<string, number>;
  bundleSelections?: Record<string, {
    kitQuantity: number;
    selections: Array<{ productId: string; quantity: number }>;
  }>;
  rewards?: {
    mode: PublicOrderRewardMode;
    points?: number;
    productId?: string;
  };
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  delivery: {
    mode: PublicOrderDeliveryMode;
    date?: string;
    time?: string;
    address?: string;
    locationLink?: string;
    regionId?: string;
    note?: string;
    shipping?: {
      recipientName: string;
      postalCode: string;
      prefecture: string;
      city: string;
      addressLine1: string;
      addressLine2?: string;
    };
  };
};

export type CreatePublicOrderResult = {
  ok: true;
  orderId: string;
  source: PublicOrderSource;
  eventId: string | null;
  currency: "JPY" | "BRL" | "USD";
  subtotalMinor: number;
  discountMinor: number;
  shippingFeeMinor: number;
  totalAmountMinor: number;
  subtotal: number;
  discount: number;
  shippingFee: number;
  totalAmount: number;
  orderStatus: "pending" | "ready";
  customerOrderRefId: string | null;
  customerRegistered: boolean;
  rewardsDiscountMinor: number;
  pointsRedeemed: number;
  pointsToEarn: number;
  rewardMode: PublicOrderRewardMode;
  replayed: boolean;
};

export class PublicOrderClientError extends Error {
  readonly code: PublicOrderErrorCode;
  readonly status: number | null;

  constructor(
    code: PublicOrderErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "PublicOrderClientError";
    this.code = code;
    this.status = status;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(source).sort()) {
      result[key] = canonicalize(source[key]);
    }

    return result;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function smallHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ord_${crypto.randomUUID()}`;
  }

  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function requestStorageKey(input: CreatePublicOrderInput): string {
  const fingerprint = smallHash(stableStringify(input));
  const eventPart = input.eventId?.trim() || "store";

  return [
    "yamada",
    "public-order",
    auth.currentUser?.uid || "guest",
    input.sellerId.trim(),
    input.source,
    eventPart,
    fingerprint,
  ].join(":");
}

function getOrCreateRequestId(key: string): string {
  if (typeof window === "undefined") return randomRequestId();

  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;

    const created = randomRequestId();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return randomRequestId();
  }
}

function clearRequestId(key: string): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Session storage is only an idempotency convenience.
  }
}

function isKnownErrorCode(value: unknown): value is PublicOrderErrorCode {
  return (
    value === "INVALID_REQUEST" ||
    value === "SELLER_UNAVAILABLE" ||
    value === "EVENT_UNAVAILABLE" ||
    value === "PRODUCT_UNAVAILABLE" ||
    value === "OFFER_UNAVAILABLE" ||
    value === "SHIPPING_UNAVAILABLE" ||
    value === "FULFILLMENT_DATE_UNAVAILABLE" ||
    value === "PRICE_CHANGED" ||
    value === "IDEMPOTENCY_CONFLICT" ||
    value === "TOO_MANY_REQUESTS" ||
    value === "NETWORK_ERROR" ||
    value === "AUTH_REQUIRED" ||
    value === "REWARDS_UNAVAILABLE" ||
    value === "INSUFFICIENT_POINTS" ||
    value === "UNKNOWN_ERROR"
  );
}

export function getPublicOrderErrorCode(
  error: unknown,
): PublicOrderErrorCode {
  if (error instanceof PublicOrderClientError) return error.code;

  if (error && typeof error === "object" && "code" in error) {
    const candidate = (error as { code?: unknown }).code;
    if (isKnownErrorCode(candidate)) return candidate;
  }

  return "UNKNOWN_ERROR";
}

export async function createPublicOrder(
  input: CreatePublicOrderInput,
): Promise<CreatePublicOrderResult> {
  const storageKey = requestStorageKey(input);
  const clientRequestId = getOrCreateRequestId(storageKey);
  let response: Response;

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (auth.currentUser) {
      try {
        headers.authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      } catch (tokenError) {
        throw new PublicOrderClientError(
          "AUTH_REQUIRED",
          "Sua sessão expirou. Entre novamente para manter este pedido na sua conta.",
        );
      }
    }

    response = await fetch("/api/orders/create", {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        ...input,
        clientRequestId,
      }),
    });
  } catch (error) {
    if (error instanceof PublicOrderClientError) throw error;

    throw new PublicOrderClientError(
      "NETWORK_ERROR",
      error instanceof Error
        ? error.message
        : "Falha de conexão ao registrar o pedido.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | CreatePublicOrderResult
    | { ok?: false; code?: unknown; error?: unknown }
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    if (response.status >= 400 && response.status < 500) {
      clearRequestId(storageKey);
    }

    const code =
      payload && "code" in payload && isKnownErrorCode(payload.code)
        ? payload.code
        : response.status === 429
          ? "TOO_MANY_REQUESTS"
          : "UNKNOWN_ERROR";
    const message =
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Não foi possível registrar o pedido.";

    throw new PublicOrderClientError(code, message, response.status);
  }

  clearRequestId(storageKey);
  return payload;
}
