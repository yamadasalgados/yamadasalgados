import { createHash, randomBytes } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminAuth, getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizePrintSettings, profileQueueKey, publicPrintProfile } from "@/app/lib/print-server";
import { normalizeCustomerAddress } from "@/app/lib/customer-profile";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import { normalizeSellerOrderSettings } from "@/app/lib/order-settings-schema";
import {
  compareDateKeys,
  defaultTimeZoneForRegional,
  earliestFulfillmentDate,
  isValidDateKey,
  normalizeProductProductionLeadTime,
  normalizeTimeZone,
  type ProductProductionLeadTime,
} from "@/app/lib/production-lead-time";
import { normalizeProductBundleConfig } from "@/app/lib/product-schema";
import {
  evaluateProductPrice,
  resolveProductScheduledPriceChange,
  type ProductScheduledPriceChange,
  type ScheduledPriceStatus,
} from "@/app/lib/scheduled-price";
import {
  evaluateRewardSelection,
  rewardProductPointCost,
  type RewardRedemptionMode,
} from "@/app/lib/reward-schema";
import {
  DEFAULT_SELLER_SHIPPING_SETTINGS,
  evaluateLocalDelivery,
  evaluatePickup,
  evaluatePostalShipping,
  normalizeProductShipping,
  normalizeSellerShippingSettings,
  type ProductShipping,
} from "@/app/lib/shipping-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderSource = "store" | "event";
type Language = "pt" | "en" | "ja";
type Currency = "JPY" | "BRL" | "USD";
type DeliveryMode = "pickup" | "delivery" | "postal" | "none";
type PricingMode =
  | "fixed_total"
  | "fixed_discount"
  | "percentage_discount";

type PublicOrderRequest = {
  source?: unknown;
  sellerId?: unknown;
  eventId?: unknown;
  clientRequestId?: unknown;
  language?: unknown;
  selectedOfferId?: unknown;
  customerClientId?: unknown;
  quantities?: unknown;
  pricing?: unknown;
  bundleSelections?: unknown;
  rewards?: unknown;
  customer?: unknown;
  delivery?: unknown;
};

type CleanOrderRequest = {
  source: OrderSource;
  sellerId: string;
  eventId: string;
  clientRequestId: string;
  language: Language;
  selectedOfferId: string;
  customerClientId: string;
  quantities: Record<string, number>;
  pricing: Record<string, number>;
  bundleSelections: Record<string, {
    kitQuantity: number;
    selections: Record<string, number>;
  }>;
  totalItems: number;
  rewards: {
    mode: RewardRedemptionMode;
    points: number;
    productId: string;
  };
  customer: {
    name: string;
    phone: string;
    email: string;
  };
  delivery: {
    mode: DeliveryMode;
    date: string;
    time: string;
    address: string;
    locationLink: string;
    regionId: string;
    note: string;
    shipping: {
      recipientName: string;
      postalCode: string;
      prefecture: string;
      city: string;
      addressLine1: string;
      addressLine2: string;
    };
  };
};

type OrderErrorCode =
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
  | "AUTH_REQUIRED"
  | "REWARDS_UNAVAILABLE"
  | "INSUFFICIENT_POINTS";

class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly status: number;

  constructor(code: OrderErrorCode, message: string, status = 400) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.status = status;
  }
}

type ProductLine = {
  productId: string;
  quantity: number;
  priceMinor: number;
  basePriceMinor: number;
  scheduledPriceStatus: ScheduledPriceStatus;
  scheduledPriceChange: ProductScheduledPriceChange;
  name: string;
  imageUrl: string;
  category: string;
  availabilityMode: "normal" | "made_to_order";
  availabilityStatus: "active" | "made_to_order";
  productionMode: "stock" | "made_to_order";
  inventoryTracked: boolean;
  inventoryQuantity: number;
  inventoryReservedBefore: number;
  inventoryLowStockThreshold: number;
  stockAvailable: number | null;
  stockReserved: number;
  stockShortage: number;
  productionRequired: number;
  productionLeadTime: ProductProductionLeadTime;
  productionLeadTimeDays: number;
  stockState: "available" | "insufficient" | "not_tracked" | "made_to_order";
  shipping: ProductShipping;
};

type EventOffer = {
  id: string;
  content: Record<string, { name?: string }>;
  eligibleProductIds: string[];
  requiredQuantity: number;
  pricing: {
    mode: PricingMode;
    regularTotalMinor: number | null;
    promotionalTotalMinor: number | null;
    discountMinor: number | null;
    percentage: number | null;
  };
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function cleanLanguage(value: unknown): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

function cleanSource(value: unknown): OrderSource {
  if (value === "store" || value === "event") return value;
  throw new OrderError("INVALID_REQUEST", "Origem do pedido inválida.");
}

function cleanDeliveryMode(value: unknown): DeliveryMode {
  return value === "delivery" || value === "postal" || value === "none" ? value : "pickup";
}

function cleanCurrency(value: unknown): Currency {
  return value === "BRL" || value === "USD" ? value : "JPY";
}

function cleanRewardMode(value: unknown): RewardRedemptionMode {
  return value === "discount" || value === "product" ? value : "none";
}

type CustomerIdentity = {
  uid: string;
  email: string;
  displayName: string;
  provider: string;
};

function bearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

async function resolveCustomerIdentity(request: NextRequest): Promise<CustomerIdentity | null> {
  const token = bearerToken(request);
  if (!token) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: cleanString(decoded.email, 200).toLowerCase(),
      displayName: cleanString(decoded.name, 120),
      provider: cleanString(decoded.firebase?.sign_in_provider, 80) || "firebase",
    };
  } catch {
    throw new OrderError(
      "AUTH_REQUIRED",
      "Sua sessão expirou. Entre novamente para manter o pedido na sua conta.",
      401,
    );
  }
}

function cleanInteger(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function cleanQuantities(value: unknown): {
  quantities: Record<string, number>;
  totalItems: number;
} {
  const raw = record(value);
  const quantities: Record<string, number> = {};
  let totalItems = 0;

  for (const [rawId, rawQuantity] of Object.entries(raw)) {
    const productId = cleanString(rawId, 160);
    const quantity = cleanInteger(rawQuantity, 0, 999);

    if (!productId || productId.includes("/") || quantity <= 0) continue;

    quantities[productId] = quantity;
    totalItems += quantity;

    if (Object.keys(quantities).length > 80) {
      throw new OrderError(
        "INVALID_REQUEST",
        "O pedido excede o limite de produtos diferentes.",
      );
    }

    if (totalItems > 1000) {
      throw new OrderError(
        "INVALID_REQUEST",
        "O pedido excede o limite total de itens.",
      );
    }
  }

  if (totalItems <= 0) {
    throw new OrderError(
      "INVALID_REQUEST",
      "Selecione pelo menos um produto.",
    );
  }

  return { quantities, totalItems };
}

function cleanBundleSelections(value: unknown): CleanOrderRequest["bundleSelections"] {
  const raw = record(value);
  const result: CleanOrderRequest["bundleSelections"] = {};

  for (const [rawKitId, rawSelection] of Object.entries(raw)) {
    const kitProductId = cleanString(rawKitId, 160);
    if (!kitProductId || kitProductId.includes("/")) continue;

    const selectionRecord = record(rawSelection);
    const kitQuantity = cleanInteger(selectionRecord.kitQuantity, 1, 10);
    const rawLines = Array.isArray(selectionRecord.selections)
      ? selectionRecord.selections
      : Object.entries(record(selectionRecord.selections)).map(([productId, quantity]) => ({ productId, quantity }));
    const selections: Record<string, number> = {};

    for (const rawLine of rawLines.slice(0, 100)) {
      const line = record(rawLine);
      const productId = cleanString(line.productId, 160);
      const quantity = cleanInteger(line.quantity, 0, 100_000);
      if (!productId || productId.includes("/") || quantity <= 0) continue;
      selections[productId] = (selections[productId] ?? 0) + quantity;
    }

    result[kitProductId] = { kitQuantity, selections };
  }

  return result;
}

function cleanPricing(value: unknown): Record<string, number> {
  const raw = record(value);
  const result: Record<string, number> = {};

  for (const [rawProductId, rawPrice] of Object.entries(raw)) {
    const productId = cleanString(rawProductId, 160);
    if (!productId || productId.includes("/")) continue;
    const priceMinor = cleanInteger(rawPrice, 0, 2_000_000_000);
    result[productId] = priceMinor;
  }

  return result;
}

function cleanRequest(value: unknown): CleanOrderRequest {
  const raw = record(value) as PublicOrderRequest;
  const source = cleanSource(raw.source);
  const sellerId = cleanString(raw.sellerId, 160);
  const eventId = cleanString(raw.eventId, 160);
  const clientRequestId = cleanString(raw.clientRequestId, 160);
  const customer = record(raw.customer);
  const delivery = record(raw.delivery);
  const shipping = record(delivery.shipping);
  const rewards = record(raw.rewards);
  const { quantities, totalItems } = cleanQuantities(raw.quantities);
  const pricing = cleanPricing(raw.pricing);
  const bundleSelections = cleanBundleSelections(raw.bundleSelections);

  if (!sellerId || sellerId.includes("/")) {
    throw new OrderError("INVALID_REQUEST", "Vendedor inválido.");
  }

  if (source === "event" && (!eventId || eventId.includes("/"))) {
    throw new OrderError("INVALID_REQUEST", "Evento inválido.");
  }

  if (
    !clientRequestId ||
    clientRequestId.includes("/") ||
    !/^[A-Za-z0-9_.:-]{12,160}$/.test(clientRequestId)
  ) {
    throw new OrderError(
      "INVALID_REQUEST",
      "Identificador de tentativa inválido.",
    );
  }

  const customerName = cleanString(customer.name, 120);
  const customerPhone = cleanString(customer.phone, 50);

  if (!customerName || !customerPhone) {
    throw new OrderError(
      "INVALID_REQUEST",
      "Informe nome e telefone para finalizar o pedido.",
    );
  }

  const deliveryMode = cleanDeliveryMode(delivery.mode);
  const deliveryDate = cleanString(delivery.date, 80);
  if (deliveryDate && !isValidDateKey(deliveryDate)) {
    throw new OrderError(
      "INVALID_REQUEST",
      "A data informada é inválida.",
    );
  }

  if (source === "event" && deliveryMode === "postal") {
    throw new OrderError(
      "SHIPPING_UNAVAILABLE",
      "Envio por correio não está disponível para eventos.",
    );
  }

  if (deliveryMode === "postal") {
    const requiredPostalFields = [
      cleanString(shipping.recipientName, 120),
      cleanString(shipping.postalCode, 30),
      cleanString(shipping.prefecture, 120),
      cleanString(shipping.city, 160),
      cleanString(shipping.addressLine1, 300),
    ];

    if (requiredPostalFields.some((field) => !field)) {
      throw new OrderError(
        "INVALID_REQUEST",
        "Preencha os dados obrigatórios para envio por correio.",
      );
    }
  }

  return {
    source,
    sellerId,
    eventId: source === "event" ? eventId : "",
    clientRequestId,
    language: cleanLanguage(raw.language),
    selectedOfferId: cleanString(raw.selectedOfferId, 160),
    customerClientId: cleanString(raw.customerClientId, 200),
    quantities,
    pricing,
    bundleSelections,
    totalItems,
    rewards: {
      mode: cleanRewardMode(rewards.mode),
      points: cleanInteger(rewards.points, 0, 2_000_000_000),
      productId: cleanString(rewards.productId, 160),
    },
    customer: {
      name: customerName,
      phone: customerPhone,
      email: cleanString(customer.email, 200),
    },
    delivery: {
      mode: deliveryMode,
      date: deliveryDate,
      time: cleanString(delivery.time, 100),
      address: cleanString(delivery.address, 1000),
      locationLink: cleanString(delivery.locationLink, 2000),
      regionId: cleanString(delivery.regionId, 120),
      note: cleanString(delivery.note, 1500),
      shipping: {
        recipientName: cleanString(shipping.recipientName, 120),
        postalCode: cleanString(shipping.postalCode, 30),
        prefecture: cleanString(shipping.prefecture, 120),
        city: cleanString(shipping.city, 160),
        addressLine1: cleanString(shipping.addressLine1, 300),
        addressLine2: cleanString(shipping.addressLine2, 300),
      },
    },
  };
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

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return Number((value as { toMillis: () => number }).toMillis());
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sellerAcceptsOrders(
  sellerData: Record<string, unknown>,
  nowMillis: number,
): boolean {
  if (sellerData.accountStatus !== "active") return false;

  const access = record(sellerData.access);
  if (access.status !== "active") return false;

  if (access.mode === "lifetime") return true;
  if (access.mode !== "subscription") return false;

  const periodEnd = timestampMillis(access.currentPeriodEnd);
  return periodEnd !== null && periodEnd > nowMillis;
}

function minorFactor(currency: Currency): number {
  return currency === "JPY" ? 1 : 100;
}

function majorToMinor(value: unknown, currency: Currency): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.round(parsed * minorFactor(currency)))
    : 0;
}

function minorToMajor(value: number, currency: Currency): number {
  return value / minorFactor(currency);
}

function resolveLocalizedName(
  raw: Record<string, unknown>,
  language: Language,
  defaultLanguage: Language,
  fallback: string,
): string {
  const content = record(raw.content);
  const order = Array.from(
    new Set<Language>([language, defaultLanguage, "pt", "en", "ja"]),
  );

  for (const candidate of order) {
    const localized = record(content[candidate]);
    const name = cleanString(localized.name, 240);
    if (name) return name;
  }

  return cleanString(raw.name ?? raw.title ?? fallback, 240) || fallback;
}

function normalizeProductLine(params: {
  productId: string;
  quantity: number;
  raw: Record<string, unknown>;
  catalogRaw?: Record<string, unknown>;
  currency: Currency;
  language: Language;
  defaultLanguage: Language;
  source: OrderSource;
  nowMillis: number;
}): ProductLine {
  const {
    productId,
    quantity,
    raw,
    catalogRaw = raw,
    currency,
    language,
    defaultLanguage,
    source,
    nowMillis,
  } = params;

  const explicitAvailabilityMode = cleanString(
    raw.availabilityMode,
    40,
  );
  const madeToOrder =
    explicitAvailabilityMode === "made_to_order" ||
    (
      explicitAvailabilityMode !== "normal" &&
      (
        raw.status === "made_to_order" ||
        raw.availabilityStatus === "made_to_order" ||
        raw.productionMode === "made_to_order"
      )
    );

  const status = cleanString(raw.status, 40);
  const catalogStatus = cleanString(catalogRaw.status, 40);
  if (source === "store" && catalogStatus === "hidden") {
    throw new OrderError(
      "PRODUCT_UNAVAILABLE",
      "Este produto não está disponível na loja pública.",
      409,
    );
  }

  const disabled =
    raw.active === false ||
    raw.enabled === false ||
    status === "inactive" ||
    status === "archived" ||
    status === "cancelled" ||
    catalogRaw.active === false ||
    catalogStatus === "inactive" ||
    catalogStatus === "archived" ||
    catalogStatus === "cancelled";

  if (disabled) {
    throw new OrderError(
      "PRODUCT_UNAVAILABLE",
      "Um dos produtos selecionados não está mais disponível.",
    );
  }

  const basePriceMinor =
    typeof raw.priceMinor === "number" && Number.isFinite(raw.priceMinor)
      ? Math.max(0, Math.round(raw.priceMinor))
      : majorToMinor(raw.sellPrice ?? raw.price ?? raw.shadowSell, currency);
  const priceEvaluation = evaluateProductPrice({
    basePriceMinor,
    scheduledPriceChange: resolveProductScheduledPriceChange(
      Object.keys(catalogRaw).length > 0 ? catalogRaw : raw,
      currency,
    ),
    currency,
    now: nowMillis,
  });
  const priceMinor = priceEvaluation.effectivePriceMinor;

  if (priceMinor <= 0) {
    throw new OrderError(
      "PRODUCT_UNAVAILABLE",
      "Um dos produtos selecionados está sem preço válido.",
    );
  }

  const inventory = normalizeProductInventory(
    catalogRaw.inventory,
    catalogRaw.stockQty ?? catalogRaw.stock,
    catalogRaw.lowStockThreshold,
  );
  const inventoryTracked = inventory.tracked;
  const normalizedStock = inventory.quantity;
  const availableBeforeReservation = inventory.available;
  const stockReserved =
    madeToOrder || !inventoryTracked
      ? 0
      : Math.min(quantity, availableBeforeReservation);
  const stockShortage =
    madeToOrder
      ? 0
      : inventoryTracked
        ? Math.max(0, quantity - stockReserved)
        : 0;
  const productionRequired = madeToOrder
    ? quantity
    : stockShortage;
  const stockState: ProductLine["stockState"] = madeToOrder
    ? "made_to_order"
    : !inventoryTracked
      ? "not_tracked"
      : stockShortage > 0
        ? "insufficient"
        : "available";

  const fallbackName = source === "event" ? productId : `Produto ${productId}`;

  const shipping = normalizeProductShipping(
    catalogRaw.shipping ?? raw.shipping,
    catalogRaw.postalEligible ?? raw.postalEligible,
    catalogRaw.shippingWeightGrams ?? raw.shippingWeightGrams,
    catalogRaw.fulfillmentOptions ??
      raw.fulfillmentOptions ?? {
        pickup: catalogRaw.pickupEligible ?? raw.pickupEligible,
        localDelivery:
          catalogRaw.localDeliveryEligible ?? raw.localDeliveryEligible,
        postal: catalogRaw.postalEligible ?? raw.postalEligible,
      },
  );
  const productionLeadTime = normalizeProductProductionLeadTime(
    catalogRaw.productionLeadTime ?? raw.productionLeadTime,
    catalogRaw.productionLeadTimeDays ?? raw.productionLeadTimeDays,
    { madeToOrder },
  );

  return {
    productId,
    quantity,
    priceMinor,
    basePriceMinor,
    scheduledPriceStatus: priceEvaluation.status,
    scheduledPriceChange: priceEvaluation.scheduledPriceChange,
    name: resolveLocalizedName(raw, language, defaultLanguage, fallbackName),
    imageUrl: cleanString(raw.imageUrl ?? raw.image, 2000),
    category: cleanString(raw.category ?? raw.categoryName, 160),
    availabilityMode: madeToOrder ? "made_to_order" : "normal",
    availabilityStatus: madeToOrder ? "made_to_order" : "active",
    productionMode: madeToOrder ? "made_to_order" : "stock",
    inventoryTracked,
    inventoryQuantity: normalizedStock,
    inventoryReservedBefore: inventory.reserved,
    inventoryLowStockThreshold: inventory.lowStockThreshold,
    stockAvailable: inventoryTracked ? availableBeforeReservation : null,
    stockReserved,
    stockShortage,
    productionRequired,
    productionLeadTime,
    productionLeadTimeDays: productionLeadTime.days,
    stockState,
    shipping,
  };
}

function normalizeEventOffer(
  id: string,
  raw: Record<string, unknown>,
  nowMillis: number,
): EventOffer {
  if (raw.status !== "active") {
    throw new OrderError("OFFER_UNAVAILABLE", "A oferta não está mais ativa.");
  }

  const startsAt = timestampMillis(raw.startsAt);
  const endsAt = timestampMillis(raw.endsAt);

  if (startsAt !== null && startsAt > nowMillis) {
    throw new OrderError("OFFER_UNAVAILABLE", "A oferta ainda não começou.");
  }

  if (endsAt !== null && endsAt < nowMillis) {
    throw new OrderError("OFFER_UNAVAILABLE", "A oferta terminou.");
  }

  const eligibleProductIds = Array.isArray(raw.eligibleProductIds)
    ? Array.from(
        new Set(
          raw.eligibleProductIds
            .map((item) => cleanString(item, 160))
            .filter(Boolean),
        ),
      )
    : [];
  const requiredQuantity = cleanInteger(raw.requiredQuantity, 0, 1000);
  const pricingRaw = record(raw.pricing);
  const mode: PricingMode =
    pricingRaw.mode === "fixed_discount" ||
    pricingRaw.mode === "percentage_discount"
      ? pricingRaw.mode
      : "fixed_total";

  if (eligibleProductIds.length === 0 || requiredQuantity < 1) {
    throw new OrderError("OFFER_UNAVAILABLE", "A oferta está incompleta.");
  }

  const optionalMinor = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  };

  const pricing = {
    mode,
    regularTotalMinor: optionalMinor(pricingRaw.regularTotalMinor),
    promotionalTotalMinor: optionalMinor(pricingRaw.promotionalTotalMinor),
    discountMinor: optionalMinor(pricingRaw.discountMinor),
    percentage:
      pricingRaw.percentage === null || pricingRaw.percentage === undefined
        ? null
        : Math.min(100, Math.max(0, Number(pricingRaw.percentage) || 0)),
  };

  if (
    (mode === "fixed_total" && pricing.promotionalTotalMinor === null) ||
    (mode === "fixed_discount" && pricing.discountMinor === null) ||
    (mode === "percentage_discount" && pricing.percentage === null)
  ) {
    throw new OrderError("OFFER_UNAVAILABLE", "A oferta está sem preço válido.");
  }

  return {
    id,
    content: record(raw.content) as Record<string, { name?: string }>,
    eligibleProductIds,
    requiredQuantity,
    pricing,
  };
}

function resolveOfferName(
  offer: EventOffer,
  language: Language,
  defaultLanguage: Language,
): string {
  for (const candidate of Array.from(
    new Set<Language>([language, defaultLanguage, "pt", "en", "ja"]),
  )) {
    const name = cleanString(offer.content?.[candidate]?.name, 240);
    if (name) return name;
  }

  return offer.id;
}

function evaluateOffer(params: {
  offer: EventOffer;
  lines: ProductLine[];
  language: Language;
  defaultLanguage: Language;
}) {
  const { offer, lines, language, defaultLanguage } = params;
  const eligible = new Set(offer.eligibleProductIds);
  const eligibleQuantity = lines.reduce(
    (sum, line) =>
      eligible.has(line.productId) ? sum + line.quantity : sum,
    0,
  );
  const bundleCount = Math.floor(eligibleQuantity / offer.requiredQuantity);

  if (bundleCount <= 0) return null;

  let remaining = bundleCount * offer.requiredQuantity;
  const selectedItems: Array<{
    productId: string;
    quantity: number;
    priceMinor: number;
  }> = [];

  for (const line of [...lines].sort((a, b) => b.priceMinor - a.priceMinor)) {
    if (remaining <= 0) break;
    if (!eligible.has(line.productId)) continue;

    const quantity = Math.min(remaining, line.quantity);
    if (quantity <= 0) continue;

    selectedItems.push({
      productId: line.productId,
      quantity,
      priceMinor: line.priceMinor,
    });
    remaining -= quantity;
  }

  const regularAmountMinor = selectedItems.reduce(
    (sum, item) => sum + item.quantity * item.priceMinor,
    0,
  );

  let discountAmountMinor = 0;

  if (offer.pricing.mode === "fixed_total") {
    discountAmountMinor = Math.max(
      0,
      regularAmountMinor -
        (offer.pricing.promotionalTotalMinor ?? 0) * bundleCount,
    );
  } else if (offer.pricing.mode === "fixed_discount") {
    discountAmountMinor = Math.min(
      regularAmountMinor,
      (offer.pricing.discountMinor ?? 0) * bundleCount,
    );
  } else {
    discountAmountMinor = Math.min(
      regularAmountMinor,
      Math.round(
        regularAmountMinor *
          Math.min(100, Math.max(0, offer.pricing.percentage ?? 0)) /
          100,
      ),
    );
  }

  if (discountAmountMinor <= 0) return null;

  return {
    offerId: offer.id,
    name: resolveOfferName(offer, language, defaultLanguage),
    pricingMode: offer.pricing.mode,
    requiredQuantity: offer.requiredQuantity,
    bundleCount,
    configuredRegularTotalMinor: offer.pricing.regularTotalMinor,
    configuredPromotionalTotalMinor: offer.pricing.promotionalTotalMinor,
    configuredDiscountMinor: offer.pricing.discountMinor,
    configuredPercentage: offer.pricing.percentage,
    regularAmountMinor,
    discountAmountMinor,
    finalAmountMinor: Math.max(0, regularAmountMinor - discountAmountMinor),
    selectedItems,
  };
}

function resultResponse(params: {
  orderId: string;
  source: OrderSource;
  eventId: string;
  currency: Currency;
  subtotalMinor: number;
  discountMinor: number;
  shippingFeeMinor: number;
  totalAmountMinor: number;
  orderStatus: "pending" | "ready";
  customerOrderRefId: string;
  customerRegistered: boolean;
  rewardsDiscountMinor: number;
  pointsRedeemed: number;
  pointsToEarn: number;
  pointsAssignedToPresenter: number;
  rewardRecipientType: "customer" | "event_presenter" | "none";
  rewardRecipientName: string;
  rewardMode: RewardRedemptionMode;
  chatAccessToken: string;
  replayed: boolean;
}) {
  return {
    ok: true as const,
    orderId: params.orderId,
    source: params.source,
    eventId: params.eventId || null,
    currency: params.currency,
    subtotalMinor: params.subtotalMinor,
    discountMinor: params.discountMinor,
    shippingFeeMinor: params.shippingFeeMinor,
    totalAmountMinor: params.totalAmountMinor,
    subtotal: minorToMajor(params.subtotalMinor, params.currency),
    discount: minorToMajor(params.discountMinor, params.currency),
    shippingFee: minorToMajor(params.shippingFeeMinor, params.currency),
    totalAmount: minorToMajor(params.totalAmountMinor, params.currency),
    orderStatus: params.orderStatus,
    customerOrderRefId: params.customerOrderRefId || null,
    customerRegistered: params.customerRegistered,
    rewardsDiscountMinor: params.rewardsDiscountMinor,
    pointsRedeemed: params.pointsRedeemed,
    pointsToEarn: params.pointsToEarn,
    pointsAssignedToPresenter: params.pointsAssignedToPresenter,
    rewardRecipientType: params.rewardRecipientType,
    rewardRecipientName: params.rewardRecipientName || null,
    rewardMode: params.rewardMode,
    chatAccessToken: params.chatAccessToken || null,
    replayed: params.replayed,
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new OrderError(
        "INVALID_REQUEST",
        "O conteúdo do pedido deve ser JSON.",
        415,
      );
    }

    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      throw new OrderError(
        "INVALID_REQUEST",
        "O JSON do pedido é inválido.",
      );
    }

    const clean = cleanRequest(requestBody);
    const customerIdentity = await resolveCustomerIdentity(request);
    if (clean.rewards.mode !== "none" && !customerIdentity) {
      throw new OrderError(
        "AUTH_REQUIRED",
        "Entre na sua conta para usar pontos.",
        401,
      );
    }
    const db = getAdminDb();
    const now = admin.firestore.Timestamp.now();
    const nowMillis = now.toMillis();
    const sellerRef = db.collection("sellers").doc(clean.sellerId);
    const customerRef = customerIdentity
      ? db.collection("customers").doc(customerIdentity.uid)
      : null;
    const rewardWalletRef = customerRef
      ? customerRef.collection("rewardWallets").doc(clean.sellerId)
      : null;
    const eventRef = clean.eventId
      ? sellerRef.collection("events").doc(clean.eventId)
      : null;
    const productIds = Object.keys(clean.quantities);
    const orderItemRefs = productIds.map((productId) =>
      clean.source === "event"
        ? eventRef!.collection("items").doc(productId)
        : sellerRef.collection("products").doc(productId),
    );
    const catalogProductRefs = productIds.map((productId) =>
      sellerRef.collection("products").doc(productId),
    );
    const bundleOptionProductIds = Array.from(new Set(
      Object.values(clean.bundleSelections).flatMap((selection) => Object.keys(selection.selections)),
    ));
    const bundleOptionRefs = bundleOptionProductIds.map((productId) =>
      sellerRef.collection("products").doc(productId),
    );
    const offerRef = clean.selectedOfferId
      ? clean.source === "event"
        ? eventRef!.collection("offers").doc(clean.selectedOfferId)
        : sellerRef.collection("offers").doc(clean.selectedOfferId)
      : null;
    const shippingSettingsRef =
      clean.source === "store"
        ? sellerRef.collection("settings").doc("shipping")
        : null;
    const printingSettingsRef = sellerRef.collection("settings").doc("printing");

    const fingerprintPayload = {
      source: clean.source,
      sellerId: clean.sellerId,
      eventId: clean.eventId,
      language: clean.language,
      selectedOfferId: clean.selectedOfferId,
      customerClientId: clean.customerClientId,
      customerUid: customerIdentity?.uid || "",
      quantities: clean.quantities,
      pricing: clean.pricing,
      bundleSelections: clean.bundleSelections,
      rewards: clean.rewards,
      customer: clean.customer,
      delivery: clean.delivery,
    };
    const requestFingerprint = sha256(fingerprintPayload);
    const markerId = sha256({
      source: clean.source,
      sellerId: clean.sellerId,
      eventId: clean.eventId,
      clientRequestId: clean.clientRequestId,
    });
    const markerRef = sellerRef.collection("orderRequests").doc(markerId);
    const orderRef =
      clean.source === "event"
        ? eventRef!.collection("orders").doc()
        : sellerRef.collection("storeOrders").doc();
    const customerOrderRef = customerRef
      ? customerRef.collection("orders").doc(sha256(orderRef.path))
      : null;
    const chatAccessToken = clean.source === "event"
      ? randomBytes(32).toString("base64url")
      : "";
    const chatAccessTokenHash = chatAccessToken
      ? createHash("sha256").update(chatAccessToken).digest("hex")
      : "";
    const notificationStateRef = sellerRef.collection("notificationState").doc("orders");

    const transactionResult = await db.runTransaction(async (transaction) => {
      const refs: admin.firestore.DocumentReference[] = [markerRef, sellerRef];
      if (customerRef) refs.push(customerRef);
      if (rewardWalletRef) refs.push(rewardWalletRef);
      if (eventRef) refs.push(eventRef);
      refs.push(...orderItemRefs);
      if (clean.source === "event") refs.push(...catalogProductRefs);
      refs.push(...bundleOptionRefs);
      if (offerRef) refs.push(offerRef);
      if (shippingSettingsRef) refs.push(shippingSettingsRef);
      refs.push(printingSettingsRef);

      const snapshots = await transaction.getAll(...refs);
      let cursor = 0;
      const markerSnapshot = snapshots[cursor++];
      const sellerSnapshot = snapshots[cursor++];
      const customerSnapshot = customerRef ? snapshots[cursor++] : null;
      const rewardWalletSnapshot = rewardWalletRef ? snapshots[cursor++] : null;
      const eventSnapshot = eventRef ? snapshots[cursor++] : null;
      const orderItemSnapshots = orderItemRefs.map(() => snapshots[cursor++]);
      const catalogProductSnapshots = clean.source === "event"
        ? catalogProductRefs.map(() => snapshots[cursor++])
        : orderItemSnapshots;
      const bundleOptionSnapshots = bundleOptionRefs.map(() => snapshots[cursor++]);
      const offerSnapshot = offerRef ? snapshots[cursor++] : null;
      const shippingSettingsSnapshot = shippingSettingsRef ? snapshots[cursor++] : null;
      const printingSettingsSnapshot = snapshots[cursor++];

      if (markerSnapshot.exists) {
        const markerData = markerSnapshot.data() ?? {};

        if (markerData.requestFingerprint !== requestFingerprint) {
          throw new OrderError(
            "IDEMPOTENCY_CONFLICT",
            "Esta tentativa já foi utilizada com outro conteúdo.",
            409,
          );
        }

        const existingOrderId = cleanString(markerData.orderId, 160);
        const existingCurrency = cleanCurrency(markerData.currency);

        if (!existingOrderId) {
          throw new OrderError(
            "IDEMPOTENCY_CONFLICT",
            "A tentativa anterior não possui resultado válido.",
            409,
          );
        }

        return resultResponse({
          orderId: existingOrderId,
          source: clean.source,
          eventId: clean.eventId,
          currency: existingCurrency,
          subtotalMinor: cleanInteger(markerData.subtotalMinor, 0, 2_000_000_000),
          discountMinor: cleanInteger(markerData.discountMinor, 0, 2_000_000_000),
          shippingFeeMinor: cleanInteger(markerData.shippingFeeMinor, 0, 2_000_000_000),
          totalAmountMinor: cleanInteger(markerData.totalAmountMinor, 0, 2_000_000_000),
          orderStatus: markerData.orderStatus === "ready" ? "ready" : "pending",
          customerOrderRefId: cleanString(markerData.customerOrderRefId, 160),
          customerRegistered: Boolean(markerData.customerRegistered),
          rewardsDiscountMinor: cleanInteger(markerData.rewardsDiscountMinor, 0, 2_000_000_000),
          pointsRedeemed: cleanInteger(markerData.pointsRedeemed, 0, 2_000_000_000),
          pointsToEarn: cleanInteger(
            markerData.customerPointsToEarn ?? markerData.pointsToEarn,
            0,
            2_000_000_000,
          ),
          pointsAssignedToPresenter:
            cleanInteger(
              markerData.customerPointsToEarn ?? markerData.pointsToEarn,
              0,
              2_000_000_000,
            ) > 0
              ? 0
              : cleanInteger(
                  markerData.pointsAssignedToPresenter,
                  0,
                  2_000_000_000,
                ),
          rewardRecipientType:
            markerData.rewardRecipientType === "event_presenter"
              ? "event_presenter"
              : markerData.rewardRecipientType === "customer"
                ? "customer"
                : "none",
          rewardRecipientName: cleanString(markerData.rewardRecipientName, 120),
          rewardMode: cleanRewardMode(markerData.rewardMode),
          chatAccessToken: cleanString(markerData.chatAccessToken, 256),
          replayed: true,
        });
      }

      if (!sellerSnapshot.exists) {
        throw new OrderError(
          "SELLER_UNAVAILABLE",
          "A loja não está disponível.",
          404,
        );
      }

      const sellerData = sellerSnapshot.data() ?? {};
      const orderSettings = normalizeSellerOrderSettings(
        sellerData.orderSettings,
        sellerData.acceptOrdersWithoutStock,
      );
      if (!sellerAcceptsOrders(sellerData, nowMillis)) {
        throw new OrderError(
          "SELLER_UNAVAILABLE",
          "A loja não está aceitando pedidos neste momento.",
          409,
        );
      }

      let eventData: Record<string, unknown> = {};
      if (clean.source === "event") {
        if (!eventSnapshot?.exists) {
          throw new OrderError(
            "EVENT_UNAVAILABLE",
            "O evento não está disponível.",
            404,
          );
        }

        eventData = eventSnapshot.data() ?? {};
        const eventStatus = cleanString(eventData.status, 40) || "active";
        const eventSellerId = cleanString(eventData.sellerId, 160);

        if (
          eventStatus !== "active" ||
          eventData.isActive === false ||
          (eventSellerId && eventSellerId !== clean.sellerId)
        ) {
          throw new OrderError(
            "EVENT_UNAVAILABLE",
            "O evento não está aceitando pedidos.",
            409,
          );
        }

        if (clean.delivery.mode === "delivery" && eventData.allowDelivery === false) {
          throw new OrderError(
            "EVENT_UNAVAILABLE",
            "A entrega não está habilitada neste evento.",
          );
        }

        if (clean.delivery.mode === "pickup" && eventData.allowPickup === false) {
          throw new OrderError(
            "EVENT_UNAVAILABLE",
            "A retirada não está habilitada neste evento.",
          );
        }
      }

      const eventRewardAssignment = clean.source === "event"
        ? record(eventData.rewardAssignment)
        : {};
      const eventRewardRecipientMode =
        clean.source === "event" &&
        cleanString(eventRewardAssignment.mode, 40) === "event_presenter" &&
        cleanString(eventRewardAssignment.recipientUid, 160)
          ? "event_presenter"
          : "customer";
      const eventRewardRecipientUid =
        eventRewardRecipientMode === "event_presenter"
          ? cleanString(eventRewardAssignment.recipientUid, 160)
          : "";
      const eventRewardRecipientName =
        eventRewardRecipientMode === "event_presenter"
          ? cleanString(eventRewardAssignment.recipientName, 120)
          : "";

      const sellerRegional = record(sellerData.regional);
      const sellerTimeZone = normalizeTimeZone(
        eventData.timeZone ?? sellerRegional.timeZone ?? sellerData.timeZone,
        defaultTimeZoneForRegional(
          eventData.regionalLocale ?? sellerRegional.locale ?? sellerData.regionalLocale,
          eventData.currency ?? sellerRegional.currency ?? sellerData.currency,
          eventData.operatingCountry ?? sellerRegional.operatingCountry ?? sellerData.operatingCountry,
        ),
      );
      const currency = cleanCurrency(
        clean.source === "event"
          ? eventData.currency ?? sellerRegional.currency
          : sellerRegional.currency ?? sellerData.currency,
      );
      const defaultLanguage = cleanLanguage(
        clean.source === "event"
          ? eventData.defaultLanguage ?? sellerData.storefrontLanguage
          : sellerData.storefrontLanguage,
      );
      const regionalLocale = cleanString(
        clean.source === "event"
          ? eventData.regionalLocale ?? sellerRegional.locale
          : sellerRegional.locale,
        30,
      );

      const lines: ProductLine[] = [];

      for (let index = 0; index < orderItemSnapshots.length; index += 1) {
        const orderItemSnapshot = orderItemSnapshots[index];
        const catalogProductSnapshot = catalogProductSnapshots[index];

        if (!orderItemSnapshot.exists || !catalogProductSnapshot.exists) {
          throw new OrderError(
            "PRODUCT_UNAVAILABLE",
            "Um dos produtos não existe mais.",
            409,
          );
        }

        const productId = productIds[index];
        lines.push(
          normalizeProductLine({
            productId,
            quantity: clean.quantities[productId],
            raw: orderItemSnapshot.data() ?? {},
            catalogRaw: catalogProductSnapshot.data() ?? {},
            currency,
            language: clean.language,
            defaultLanguage,
            source: clean.source,
            nowMillis,
          }),
        );
      }

      const changedPriceLines = lines.filter((line) => {
        const submittedPrice = clean.pricing[line.productId];
        return typeof submittedPrice === "number" && submittedPrice !== line.priceMinor;
      });
      if (changedPriceLines.length > 0) {
        throw new OrderError(
          "PRICE_CHANGED",
          "O preço de um ou mais produtos mudou. Revise o carrinho e tente novamente.",
          409,
        );
      }

      const bundleOptionMap = new Map(
        bundleOptionProductIds.map((productId, index) => [productId, bundleOptionSnapshots[index]] as const),
      );
      const bundleSnapshots = new Map<string, {
        kitQuantity: number;
        totalUnitsPerKit: number;
        totalUnits: number;
        selections: Array<{ productId: string; name: string; imageUrl: string; quantity: number }>;
      }>();

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const catalogRaw = catalogProductSnapshots[index].data() ?? {};
        const config = normalizeProductBundleConfig(catalogRaw.bundleConfig);
        const submitted = clean.bundleSelections[line.productId];

        if (!config.enabled) {
          if (submitted) {
            throw new OrderError("INVALID_REQUEST", "A composição enviada não pertence a um kit configurável.");
          }
          continue;
        }

        if (!submitted) {
          if (clean.source === "event") {
            continue;
          }
          throw new OrderError("INVALID_REQUEST", "Monte a composição completa do kit antes de finalizar.");
        }
        if (submitted.kitQuantity !== line.quantity) {
          throw new OrderError("INVALID_REQUEST", "A quantidade de kits não corresponde à composição selecionada.");
        }

        const allowed = new Set(config.optionProductIds);
        const selectedEntries = Object.entries(submitted.selections);
        const selectedTotal = selectedEntries.reduce((sum, [, quantity]) => sum + quantity, 0);
        const expectedTotal = config.totalUnits * line.quantity;

        if (selectedTotal !== expectedTotal || selectedEntries.length === 0) {
          throw new OrderError(
            "INVALID_REQUEST",
            `A composição de ${line.name} deve totalizar exatamente ${expectedTotal} unidades.`,
          );
        }

        const selections = selectedEntries.map(([productId, quantity]) => {
          if (!allowed.has(productId)) {
            throw new OrderError("PRODUCT_UNAVAILABLE", "Uma opção selecionada não pertence mais a este kit.", 409);
          }
          const optionSnapshot = bundleOptionMap.get(productId);
          if (!optionSnapshot?.exists) {
            throw new OrderError("PRODUCT_UNAVAILABLE", "Uma opção do kit não existe mais.", 409);
          }
          const optionRaw = optionSnapshot.data() ?? {};
          const optionStatus = cleanString(optionRaw.status, 40);
          if (optionStatus === "inactive" || optionRaw.active === false) {
            throw new OrderError("PRODUCT_UNAVAILABLE", "Uma opção do kit não está mais disponível.", 409);
          }
          return {
            productId,
            name: resolveLocalizedName(optionRaw, clean.language, defaultLanguage, `Produto ${productId}`),
            imageUrl: cleanString(optionRaw.imageUrl ?? optionRaw.image, 2000),
            quantity,
          };
        });

        line.availabilityMode = "made_to_order";
        line.availabilityStatus = "made_to_order";
        line.productionMode = "made_to_order";
        line.inventoryTracked = false;
        line.stockAvailable = null;
        line.stockReserved = 0;
        line.stockShortage = 0;
        line.productionRequired = expectedTotal;
        line.stockState = "made_to_order";

        bundleSnapshots.set(line.productId, {
          kitQuantity: line.quantity,
          totalUnitsPerKit: config.totalUnits,
          totalUnits: expectedTotal,
          selections,
        });
      }

      const unavailableStockLines = lines.filter(
        (line) =>
          line.availabilityMode !== "made_to_order" &&
          line.inventoryTracked &&
          line.stockShortage > 0,
      );

      if (
        unavailableStockLines.length > 0 &&
        !orderSettings.acceptOrdersWithoutStock
      ) {
        throw new OrderError(
          "PRODUCT_UNAVAILABLE",
          unavailableStockLines.length === 1
            ? `${unavailableStockLines[0].name} não possui estoque suficiente para esta quantidade.`
            : "Um ou mais produtos não possuem estoque suficiente. Atualize a página e ajuste o carrinho.",
          409,
        );
      }

      const productionLines = lines.filter((line) => line.productionRequired > 0);
      const maxProductionLeadTimeDays = productionLines.reduce(
        (maximum, line) => Math.max(maximum, line.productionLeadTimeDays),
        0,
      );
      const earliestOrderFulfillmentDate = earliestFulfillmentDate({
        now: nowMillis,
        timeZone: sellerTimeZone,
        leadTimeDays: maxProductionLeadTimeDays,
      });
      const productionScheduleProductIds = productionLines
        .filter((line) => line.productionLeadTimeDays === maxProductionLeadTimeDays)
        .map((line) => line.productId);

      if (
        productionLines.length > 0 &&
        isValidDateKey(clean.delivery.date) &&
        compareDateKeys(clean.delivery.date, earliestOrderFulfillmentDate) < 0
      ) {
        throw new OrderError(
          "FULFILLMENT_DATE_UNAVAILABLE",
          `A primeira data disponível para este pedido é ${earliestOrderFulfillmentDate}.`,
          409,
        );
      }

      const subtotalMinor = lines.reduce(
        (sum, line) => sum + line.priceMinor * line.quantity,
        0,
      );
      let discountMinor = 0;
      let offersApplied: Array<Record<string, unknown>> = [];

      if (clean.selectedOfferId) {
        if (!offerSnapshot?.exists) {
          throw new OrderError(
            "OFFER_UNAVAILABLE",
            "A oferta não está disponível.",
            409,
          );
        }

        const offer = normalizeEventOffer(
          clean.selectedOfferId,
          offerSnapshot.data() ?? {},
          nowMillis,
        );
        const appliedOffer = evaluateOffer({
          offer,
          lines,
          language: clean.language,
          defaultLanguage,
        });

        if (appliedOffer) {
          offersApplied = [appliedOffer];
          discountMinor = appliedOffer.discountAmountMinor;
        }
      }

      discountMinor = Math.min(subtotalMinor, Math.max(0, discountMinor));
      const offerDiscountMinor = discountMinor;
      const merchandisePayableBeforeRewardsMinor = Math.max(
        0,
        subtotalMinor - offerDiscountMinor,
      );
      const rewardWalletData = rewardWalletSnapshot?.data() ?? {};
      const rewardWalletBalance = cleanInteger(
        rewardWalletData.pointsBalance,
        0,
        2_000_000_000,
      );
      const rewardEvaluation = evaluateRewardSelection({
        selection: clean.rewards,
        walletBalance: rewardWalletBalance,
        merchandisePayableMinor: merchandisePayableBeforeRewardsMinor,
        currency,
        cartLines: lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPriceMinor: line.priceMinor,
        })),
        offerApplied: Boolean(clean.selectedOfferId && offerDiscountMinor > 0),
      });

      if (clean.rewards.mode === "discount") {
        if (clean.rewards.points <= 0) {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "Informe quantos pontos deseja usar.",
          );
        }
        if (rewardWalletBalance < clean.rewards.points) {
          throw new OrderError(
            "INSUFFICIENT_POINTS",
            "Seu saldo de pontos não é suficiente.",
            409,
          );
        }
        if (rewardEvaluation.pointsRedeemed !== clean.rewards.points) {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "A quantidade de pontos excede o valor dos produtos desta compra.",
            409,
          );
        }
      }

      if (clean.rewards.mode === "product") {
        if (clean.selectedOfferId && offerDiscountMinor > 0) {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "A troca por produto não pode ser combinada com uma oferta ou kit.",
            409,
          );
        }
        const selectedLine = lines.find(
          (line) => line.productId === clean.rewards.productId && line.quantity > 0,
        );
        if (!selectedLine) {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "Selecione um produto válido do carrinho para a troca.",
            409,
          );
        }
        const selectedProductPointCost = rewardProductPointCost(
          selectedLine.priceMinor,
          currency,
        );
        if (selectedProductPointCost <= 0) {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "Este produto não está disponível para troca por pontos.",
            409,
          );
        }
        if (rewardWalletBalance < selectedProductPointCost) {
          throw new OrderError(
            "INSUFFICIENT_POINTS",
            "Seu saldo de pontos não é suficiente.",
            409,
          );
        }
        if (rewardEvaluation.mode !== "product") {
          throw new OrderError(
            "REWARDS_UNAVAILABLE",
            "Este produto não pode ser trocado com o saldo atual.",
            409,
          );
        }
      }

      const rewardsDiscountMinor = rewardEvaluation.discountMinor;
      discountMinor = Math.min(
        subtotalMinor,
        offerDiscountMinor + rewardsDiscountMinor,
      );
      const merchandisePaidMinor = Math.max(0, subtotalMinor - discountMinor);
      const pointsRedeemed = rewardEvaluation.pointsRedeemed;
      const pointsToEarn = rewardEvaluation.pointsToEarn;
      const earnRecipientType: "customer" | "event_presenter" | "none" =
        eventRewardRecipientMode === "event_presenter"
          ? "event_presenter"
          : customerIdentity?.uid
            ? "customer"
            : "none";
      const earnRecipientUid =
        earnRecipientType === "event_presenter"
          ? eventRewardRecipientUid
          : earnRecipientType === "customer"
            ? customerIdentity?.uid || ""
            : "";
      const earnRecipientName =
        earnRecipientType === "event_presenter"
          ? eventRewardRecipientName
          : clean.customer.name || customerIdentity?.displayName || "";
      const customerPointsToEarn =
        earnRecipientUid && customerIdentity?.uid === earnRecipientUid
          ? pointsToEarn
          : 0;
      const pointsAssignedToPresenter =
        earnRecipientType === "event_presenter" ? pointsToEarn : 0;
      const customerVisiblePresenterPoints =
        earnRecipientType === "event_presenter" &&
        customerIdentity?.uid !== earnRecipientUid
          ? pointsToEarn
          : 0;
      const rewardEarnStatus =
        pointsToEarn > 0 && earnRecipientUid ? "pending" : "not_eligible";

      let shippingFeeMinor = 0;
      let shippingSnapshot: Record<string, unknown> | null = null;
      let fulfillmentSnapshot: Record<string, unknown> | null = null;

      if (clean.source === "store" && clean.delivery.mode !== "none") {
        const shippingSettings = normalizeSellerShippingSettings(
          shippingSettingsSnapshot?.exists
            ? shippingSettingsSnapshot.data() ?? {}
            : DEFAULT_SELLER_SHIPPING_SETTINGS,
        );
        const productsForFulfillment = lines.map((line) => ({
          quantity: line.quantity,
          shipping: line.shipping,
        }));

        if (clean.delivery.mode === "pickup") {
          const evaluation = evaluatePickup({
            settings: shippingSettings,
            products: productsForFulfillment,
            subtotalMinor,
          });
          if (!evaluation.available) {
            throw new OrderError(
              "SHIPPING_UNAVAILABLE",
              evaluation.reason === "product_not_eligible"
                ? "Um dos produtos não está disponível para retirada."
                : evaluation.reason === "minimum_order"
                  ? "O pedido não atingiu o valor mínimo para retirada."
                  : "A retirada não está disponível.",
              409,
            );
          }
          shippingFeeMinor = evaluation.feeMinor;
          fulfillmentSnapshot = {
            schemaVersion: 1,
            method: "pickup",
            label: evaluation.label || "Retirada",
            description: evaluation.description,
            instructions: evaluation.instructions,
            feeMinor: evaluation.feeMinor,
            fee: minorToMajor(evaluation.feeMinor, currency),
            quoteStatus: evaluation.quoteStatus,
            minimumOrderMinor: evaluation.minimumOrderMinor,
            freeAboveMinor: evaluation.freeAboveMinor,
            estimatedDaysMin: evaluation.estimatedDaysMin,
            estimatedDaysMax: evaluation.estimatedDaysMax,
          };
        } else if (clean.delivery.mode === "delivery") {
          const evaluation = evaluateLocalDelivery({
            settings: shippingSettings,
            products: productsForFulfillment,
            subtotalMinor,
            regionId: clean.delivery.regionId || null,
          });
          if (!evaluation.available || evaluation.quoteStatus === "region_required") {
            throw new OrderError(
              "SHIPPING_UNAVAILABLE",
              evaluation.quoteStatus === "region_required"
                ? "Selecione uma região de delivery."
                : evaluation.reason === "product_not_eligible"
                  ? "Um dos produtos não está disponível para delivery."
                  : evaluation.reason === "minimum_order"
                    ? "O pedido não atingiu o valor mínimo para delivery."
                    : "O delivery não está disponível para a região selecionada.",
              409,
            );
          }
          if (!clean.delivery.address) {
            throw new OrderError(
              "INVALID_REQUEST",
              "Informe o endereço para delivery.",
            );
          }
          shippingFeeMinor = evaluation.feeMinor;
          fulfillmentSnapshot = {
            schemaVersion: 1,
            method: "delivery",
            label: evaluation.label || "Delivery local",
            description: evaluation.description,
            instructions: evaluation.instructions,
            feeMinor: evaluation.feeMinor,
            fee: minorToMajor(evaluation.feeMinor, currency),
            quoteStatus: evaluation.quoteStatus,
            minimumOrderMinor: evaluation.minimumOrderMinor,
            freeAboveMinor: evaluation.freeAboveMinor,
            estimatedDaysMin: evaluation.estimatedDaysMin,
            estimatedDaysMax: evaluation.estimatedDaysMax,
            regionId: evaluation.appliedRegion?.id ?? null,
            regionName: evaluation.appliedRegion?.name ?? null,
            region: evaluation.appliedRegion,
          };
        } else if (clean.delivery.mode === "postal") {
          const evaluation = evaluatePostalShipping({
            settings: shippingSettings,
            products: productsForFulfillment,
            subtotalMinor,
          });
          if (!evaluation.available) {
            const message =
              evaluation.reason === "product_not_eligible"
                ? "Um dos produtos não pode ser enviado por correio."
                : evaluation.reason === "minimum_order"
                  ? "O pedido não atingiu o valor mínimo para envio por correio."
                  : evaluation.reason === "weight_missing"
                    ? "Um dos produtos não possui peso para calcular o frete."
                    : evaluation.reason === "weight_limit_exceeded"
                      ? "O peso do pedido excede as faixas de frete configuradas."
                      : "O envio por correio não está disponível.";
            throw new OrderError("SHIPPING_UNAVAILABLE", message, 409);
          }

          shippingFeeMinor = evaluation.shippingFeeMinor ?? 0;
          shippingSnapshot = {
            schemaVersion: 3,
            pricingMode: evaluation.pricingMode,
            quoteStatus: evaluation.quoteStatus,
            recipientName: clean.delivery.shipping.recipientName,
            postalCode: clean.delivery.shipping.postalCode,
            prefecture: clean.delivery.shipping.prefecture,
            city: clean.delivery.shipping.city,
            addressLine1: clean.delivery.shipping.addressLine1,
            addressLine2: clean.delivery.shipping.addressLine2 || null,
            totalWeightGrams: evaluation.totalWeightGrams,
            shippingFeeMinor: evaluation.shippingFeeMinor,
            shippingFee:
              evaluation.shippingFeeMinor === null
                ? null
                : minorToMajor(evaluation.shippingFeeMinor, currency),
            appliedBand: evaluation.appliedBand,
            instructions: evaluation.instructions,
            pricingSnapshot: shippingSettings.postal,
          };
          fulfillmentSnapshot = {
            schemaVersion: 1,
            method: "postal",
            label: evaluation.label || "Envio por correio",
            description: evaluation.description,
            instructions: evaluation.instructions,
            feeMinor: evaluation.shippingFeeMinor,
            fee:
              evaluation.shippingFeeMinor === null
                ? null
                : minorToMajor(evaluation.shippingFeeMinor, currency),
            quoteStatus: evaluation.quoteStatus,
            minimumOrderMinor: evaluation.minimumOrderMinor,
            freeAboveMinor: evaluation.freeAboveMinor,
            estimatedDaysMin: evaluation.estimatedDaysMin,
            estimatedDaysMax: evaluation.estimatedDaysMax,
            pricingMode: evaluation.pricingMode,
            totalWeightGrams: evaluation.totalWeightGrams,
          };
        }
      }

      const totalAmountMinor = Math.max(
        0,
        subtotalMinor - discountMinor + shippingFeeMinor,
      );
      const hasMadeToOrderItems = lines.some(
        (line) => line.availabilityMode === "made_to_order",
      );
      const hasStockShortage = lines.some(
        (line) => line.stockShortage > 0,
      );
      const initialOrderStatus: "pending" | "ready" =
        hasMadeToOrderItems || hasStockShortage ? "pending" : "ready";
      const readinessReasonCodes = [
        ...(hasMadeToOrderItems ? ["made_to_order"] : []),
        ...(hasStockShortage ? ["stock_shortage"] : []),
      ];
      const items = lines.map((line) => {
        const reservationStatus =
          line.availabilityMode === "made_to_order" || !line.inventoryTracked
            ? "none"
            : line.stockReserved >= line.quantity
              ? "reserved"
              : line.stockReserved > 0
                ? "partial"
                : "none";

        return {
          productId: line.productId,
          name: line.name,
          qty: line.quantity,
          quantity: line.quantity,
          unitPriceMinor: line.priceMinor,
          unitPrice: minorToMajor(line.priceMinor, currency),
          baseUnitPriceMinor: line.basePriceMinor,
          baseUnitPrice: minorToMajor(line.basePriceMinor, currency),
          priceSource:
            line.scheduledPriceStatus === "active"
              ? "scheduled_increase"
              : "base_price",
          scheduledPriceStatus: line.scheduledPriceStatus,
          scheduledPriceChange: {
            schemaVersion: 2,
            enabled: line.scheduledPriceChange.enabled,
            nextPriceMinor: line.scheduledPriceChange.nextPriceMinor,
            startsAtMillis: line.scheduledPriceChange.startsAtMillis,
            message: line.scheduledPriceChange.message || null,
            showCountdown: line.scheduledPriceChange.showCountdown,
            noticeStartsBeforeDays: line.scheduledPriceChange.noticeStartsBeforeDays,
            countdownStartsBeforeMinutes: line.scheduledPriceChange.countdownStartsBeforeMinutes,
            showInLastChance: line.scheduledPriceChange.showInLastChance,
            appliedNoticeDurationDays: line.scheduledPriceChange.appliedNoticeDurationDays,
          },
          subtotalMinor: line.priceMinor * line.quantity,
          subtotal: minorToMajor(line.priceMinor * line.quantity, currency),
          imageUrl: line.imageUrl,
          category: line.category,
          availabilityMode: line.availabilityMode,
          availabilityStatus: line.availabilityStatus,
          productionMode: line.productionMode,
          inventoryTracked: line.inventoryTracked,
          stockAvailable: line.stockAvailable,
          stockReserved: line.stockReserved,
          stockShortage: line.stockShortage,
          productionRequired: line.productionRequired,
          productionLeadTime: line.productionLeadTime,
          productionLeadTimeDays: line.productionLeadTimeDays,
          productionScheduleApplied: line.productionRequired > 0,
          earliestFulfillmentDate: earliestFulfillmentDate({
            now: nowMillis,
            timeZone: sellerTimeZone,
            leadTimeDays: line.productionRequired > 0 ? line.productionLeadTimeDays : 0,
          }),
          stockState: line.stockState,
          inventoryState: {
            reservationStatus,
            reservedQuantity: line.stockReserved,
            shortageQuantity: line.stockShortage,
            productionRequired: line.productionRequired,
            productionLeadTimeDays: line.productionLeadTimeDays,
            earliestFulfillmentDate: earliestFulfillmentDate({
              now: nowMillis,
              timeZone: sellerTimeZone,
              leadTimeDays: line.productionRequired > 0 ? line.productionLeadTimeDays : 0,
            }),
            producedQuantity: 0,
            consumedQuantity: 0,
            releasedQuantity: 0,
            productionStatus:
              line.availabilityMode === "made_to_order"
                ? "pending"
                : "not_required",
          },
          fulfillmentOptions: line.shipping.fulfillment,
          pickupEligible: line.shipping.fulfillment.pickup,
          localDeliveryEligible: line.shipping.fulfillment.localDelivery,
          postalEligible: line.shipping.fulfillment.postal,
          shipping: line.shipping,
          shippingWeightGrams: line.shipping.weightGrams,
          options: bundleSnapshots.get(line.productId)?.selections.map((selection) => ({
            id: selection.productId,
            productId: selection.productId,
            name: selection.name,
            imageUrl: selection.imageUrl,
            quantity: selection.quantity,
          })) ?? [],
          bundle: bundleSnapshots.get(line.productId) ?? null,
        };
      });
      const quantities = Object.fromEntries(
        lines.map((line) => [line.productId, line.quantity]),
      );
      const orderPayload: Record<string, unknown> = {
        schemaVersion: 2,
        orderSource: clean.source,
        sellerId: clean.sellerId,
        eventId: clean.eventId || null,
        clientRequestId: clean.clientRequestId,
        requestFingerprint,
        currency,
        regionalLocale: regionalLocale || null,
        language: clean.language,
        customerName: clean.customer.name,
        customerPhone: clean.customer.phone,
        customerEmail: clean.customer.email || null,
        customerClientId: clean.customerClientId || null,
        customerUid: customerIdentity?.uid || null,
        customerRegistered: Boolean(customerIdentity),
        customerAuthProvider: customerIdentity?.provider || null,
        customerOrderRefId: customerOrderRef?.id || null,
        chatAccess: clean.source === "event"
          ? {
              schemaVersion: 1,
              tokenHash: chatAccessTokenHash,
              createdAt: now,
              revokedAt: null,
            }
          : null,
        quantities,
        items,
        totalItems: clean.totalItems,
        pricingSchedule: {
          schemaVersion: 1,
          evaluatedAt: now,
          evaluatedAtMillis: nowMillis,
          scheduledProductIds: lines
            .filter((line) => line.scheduledPriceStatus === "upcoming" || line.scheduledPriceStatus === "active")
            .map((line) => line.productId),
          appliedProductIds: lines
            .filter((line) => line.scheduledPriceStatus === "active")
            .map((line) => line.productId),
        },
        totalSelectedUnits: Array.from(bundleSnapshots.values()).reduce((sum, bundle) => sum + bundle.totalUnits, 0),
        subtotalMinor,
        discountMinor,
        offerDiscountMinor,
        rewardsDiscountMinor,
        shippingFeeMinor,
        totalAmountMinor,
        subtotal: minorToMajor(subtotalMinor, currency),
        discount: minorToMajor(discountMinor, currency),
        shippingFee: minorToMajor(shippingFeeMinor, currency),
        deliveryFee: minorToMajor(shippingFeeMinor, currency),
        totalAmount: minorToMajor(totalAmountMinor, currency),
        offersApplied,
        selectedOfferId: clean.selectedOfferId || null,
        rewards: {
          schemaVersion: 2,
          sellerId: clean.sellerId,
          mode: rewardEvaluation.mode,
          pointsRedeemed,
          discountMinor: rewardsDiscountMinor,
          rewardProductId: rewardEvaluation.rewardProductId || null,
          rewardProductName: rewardEvaluation.rewardProductName || null,
          rewardProductPoints: rewardEvaluation.rewardProductPoints,
          redemptionStatus: pointsRedeemed > 0 ? "committed" : "none",
          buyerCustomerUid: customerIdentity?.uid || null,
          pointsToEarn,
          customerPointsToEarn,
          pointsAssignedToPresenter,
          earnStatus: rewardEarnStatus,
          earnRecipientType,
          earnRecipientUid: earnRecipientUid || null,
          earnRecipientName: earnRecipientName || null,
          earnRecipientSource:
            earnRecipientType === "event_presenter"
              ? "event_assignment"
              : earnRecipientType === "customer"
                ? "customer_order"
                : "none",
          eventRewardAssignmentSnapshot:
            clean.source === "event"
              ? {
                  schemaVersion: 1,
                  mode: eventRewardRecipientMode,
                  recipientUid:
                    eventRewardRecipientMode === "event_presenter"
                      ? eventRewardRecipientUid || null
                      : null,
                  recipientName:
                    eventRewardRecipientMode === "event_presenter"
                      ? eventRewardRecipientName || null
                      : null,
                }
              : null,
          merchandisePaidMinor,
          creditedAt: null,
          refundedAt: null,
        },
        productionSchedule: {
          schemaVersion: 1,
          timeZone: sellerTimeZone,
          maxLeadTimeDays: maxProductionLeadTimeDays,
          earliestFulfillmentDate: earliestOrderFulfillmentDate,
          productIds: productionScheduleProductIds,
          productionRequired: productionLines.length > 0,
          calculatedAt: now,
        },
        productionLeadTimeDays: maxProductionLeadTimeDays,
        earliestFulfillmentDate: earliestOrderFulfillmentDate,
        status: initialOrderStatus,
        fulfillmentStatus: initialOrderStatus,
        readiness: {
          hasMadeToOrderItems,
          hasStockShortage,
          reasonCodes: readinessReasonCodes,
          stockOrderPolicy: orderSettings.stockOrderPolicy,
          sellerConfirmationRequired: hasStockShortage,
        },
        inventoryManaged: true,
        inventoryState: {
          reservationStatus:
            hasStockShortage
              ? lines.some((line) => line.stockReserved > 0)
                ? "partial"
                : "none"
              : lines.some((line) => line.stockReserved > 0)
                ? "reserved"
                : "none",
          reservedQuantity: lines.reduce((sum, line) => sum + line.stockReserved, 0),
          shortageQuantity: lines.reduce((sum, line) => sum + line.stockShortage, 0),
          productionRequired: lines.reduce((sum, line) => sum + line.productionRequired, 0),
          producedQuantity: 0,
          consumedQuantity: 0,
          releasedQuantity: 0,
        },
        channel: clean.source === "store" ? "store" : "pwa",
        deliveryMode: clean.delivery.mode,
        fulfillment: fulfillmentSnapshot,
        deliveryRegionId: clean.delivery.regionId || null,
        deliveryRegion:
          fulfillmentSnapshot && clean.delivery.mode === "delivery"
            ? (fulfillmentSnapshot.region ?? null)
            : null,
        deliveryDate: clean.delivery.date || null,
        deliveryTimeSlot: clean.delivery.time || null,
        address:
          clean.delivery.mode === "postal"
            ? [
                clean.delivery.shipping.postalCode,
                clean.delivery.shipping.prefecture,
                clean.delivery.shipping.city,
                clean.delivery.shipping.addressLine1,
                clean.delivery.shipping.addressLine2,
              ].filter(Boolean).join(" ")
            : clean.delivery.address || null,
        shipping: shippingSnapshot,
        locationLink:
          clean.delivery.mode === "delivery"
            ? clean.delivery.locationLink || null
            : null,
        note: clean.delivery.note || null,
        sellerUnread: true,
        sellerReadAt: null,
        history: [
          {
            status: initialOrderStatus,
            createdAt: now,
            updatedBy: "public-order-api",
            note:
              initialOrderStatus === "pending"
                ? readinessReasonCodes.join(",")
                : "stock_available",
          },
        ],
        createdAt: now,
        updatedAt: now,
        createdBy: "public-order-api",
        updatedBy: "public-order-api",
      };

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const catalogProductRef = catalogProductRefs[index];

        if (
          line.availabilityMode !== "made_to_order" &&
          line.inventoryTracked &&
          line.stockReserved > 0
        ) {
          const nextReserved = line.inventoryReservedBefore + line.stockReserved;
          transaction.set(
            catalogProductRef,
            {
              inventory: {
                tracked: true,
                quantity: line.inventoryQuantity,
                reserved: nextReserved,
                lowStockThreshold: line.inventoryLowStockThreshold,
              },
              stockQty: line.inventoryQuantity,
              updatedAt: now,
            },
            { merge: true },
          );

          const movementRef = sellerRef
            .collection("inventoryMovements")
            .doc(`${orderRef.id}_${line.productId}_reserve`);
          transaction.create(movementRef, {
            schemaVersion: 2,
            type: "reserve",
            sellerId: clean.sellerId,
            productId: line.productId,
            orderId: orderRef.id,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            quantity: line.stockReserved,
            before: {
              quantity: line.inventoryQuantity,
              reserved: line.inventoryReservedBefore,
              available: Math.max(0, line.inventoryQuantity - line.inventoryReservedBefore),
            },
            after: {
              quantity: line.inventoryQuantity,
              reserved: nextReserved,
              available: Math.max(0, line.inventoryQuantity - nextReserved),
            },
            createdAt: now,
            createdBy: "public-order-api",
          });
        }

        if (line.stockShortage > 0 || line.productionRequired > 0) {
          const shortageRef = sellerRef
            .collection("inventoryMovements")
            .doc(`${orderRef.id}_${line.productId}_requirement`);
          transaction.create(shortageRef, {
            schemaVersion: 2,
            type:
              line.availabilityMode === "made_to_order"
                ? "production_required"
                : "reserve_shortage",
            sellerId: clean.sellerId,
            productId: line.productId,
            orderId: orderRef.id,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            quantity: line.productionRequired || line.stockShortage,
            before: {
              quantity: line.inventoryQuantity,
              reserved: line.inventoryReservedBefore,
              available: Math.max(0, line.inventoryQuantity - line.inventoryReservedBefore),
            },
            after: {
              quantity: line.inventoryQuantity,
              reserved: line.inventoryReservedBefore + line.stockReserved,
              available: Math.max(
                0,
                line.inventoryQuantity - line.inventoryReservedBefore - line.stockReserved,
              ),
            },
            createdAt: now,
            createdBy: "public-order-api",
          });
        }
      }

      if (rewardWalletRef && customerIdentity) {
        const storeName =
          cleanString(sellerData.storeName ?? sellerData.displayName, 160) || "Loja";
        const currentBalance = rewardWalletBalance;
        const nextBalance = currentBalance - pointsRedeemed;

        if (nextBalance < 0) {
          throw new OrderError(
            "INSUFFICIENT_POINTS",
            "Seu saldo de pontos foi alterado. Atualize a página e tente novamente.",
            409,
          );
        }

        const walletPayload: Record<string, unknown> = {
          schemaVersion: 1,
          customerUid: customerIdentity.uid,
          sellerId: clean.sellerId,
          storeName,
          currency,
          pointsBalance: nextBalance,
          lifetimeEarned: cleanInteger(rewardWalletData.lifetimeEarned, 0, 2_000_000_000),
          lifetimeRedeemed:
            cleanInteger(rewardWalletData.lifetimeRedeemed, 0, 2_000_000_000) +
            pointsRedeemed,
          lifetimeRefunded: cleanInteger(
            rewardWalletData.lifetimeRefunded,
            0,
            2_000_000_000,
          ),
          updatedAt: now,
        };
        if (!rewardWalletSnapshot?.exists) walletPayload.createdAt = now;
        transaction.set(rewardWalletRef, walletPayload, { merge: true });

        if (pointsRedeemed > 0) {
          const redemptionRef = rewardWalletRef
            .collection("transactions")
            .doc(`redeem_${orderRef.id}`);
          transaction.create(redemptionRef, {
            schemaVersion: 1,
            type: "redeem",
            points: pointsRedeemed,
            balanceBefore: currentBalance,
            balanceAfter: nextBalance,
            sellerId: clean.sellerId,
            customerUid: customerIdentity.uid,
            orderId: orderRef.id,
            orderPath: orderRef.path,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            rewardMode: rewardEvaluation.mode,
            rewardProductId: rewardEvaluation.rewardProductId || null,
            rewardProductName: rewardEvaluation.rewardProductName || null,
            label:
              rewardEvaluation.mode === "product"
                ? `Troca: ${rewardEvaluation.rewardProductName}`
                : "Desconto com pontos",
            createdAt: now,
          });
        }
      }

      if (customerRef && customerIdentity) {
        const customerData = customerSnapshot?.data() ?? {};
        const customerRewards =
          customerData.rewards &&
          typeof customerData.rewards === "object" &&
          !Array.isArray(customerData.rewards)
            ? customerData.rewards
            : {
                pointsBalance: 0,
                lifetimeEarned: 0,
                lifetimeRedeemed: 0,
                schemaVersion: 1,
              };

        const currentAddress = normalizeCustomerAddress(customerData.address);
        const customerAddress = {
          deliveryAddress: currentAddress.deliveryAddress || clean.delivery.address,
          locationLink: currentAddress.locationLink || clean.delivery.locationLink,
          recipientName:
            currentAddress.recipientName ||
            clean.delivery.shipping.recipientName ||
            clean.customer.name,
          postalCode: currentAddress.postalCode || clean.delivery.shipping.postalCode,
          prefecture: currentAddress.prefecture || clean.delivery.shipping.prefecture,
          city: currentAddress.city || clean.delivery.shipping.city,
          addressLine1: currentAddress.addressLine1 || clean.delivery.shipping.addressLine1,
          addressLine2: currentAddress.addressLine2 || clean.delivery.shipping.addressLine2,
        };

        const customerPayload: Record<string, unknown> = {
          schemaVersion: 2,
          uid: customerIdentity.uid,
          name: clean.customer.name || customerIdentity.displayName || null,
          phone: clean.customer.phone || null,
          email: clean.customer.email || customerIdentity.email || null,
          preferredLanguage: clean.language,
          address: customerAddress,
          accountStatus: customerData.accountStatus === "disabled" ? "disabled" : "active",
          rewards: customerRewards,
          orderCount: admin.firestore.FieldValue.increment(1),
          lastOrderId: orderRef.id,
          lastOrderPath: orderRef.path,
          lastSellerId: clean.sellerId,
          lastOrderAt: now,
          updatedAt: now,
        };

        if (!customerSnapshot?.exists) {
          customerPayload.createdAt = now;
        }

        if (clean.customerClientId) {
          customerPayload.anonymousClientIds =
            admin.firestore.FieldValue.arrayUnion(clean.customerClientId);
        }

        transaction.set(customerRef, customerPayload, { merge: true });
      }

      transaction.create(orderRef, orderPayload);

      transaction.set(
        notificationStateRef,
        {
          schemaVersion: 1,
          unreadCount: admin.firestore.FieldValue.increment(1),
          storeUnreadCount: admin.firestore.FieldValue.increment(clean.source === "store" ? 1 : 0),
          eventUnreadCount: admin.firestore.FieldValue.increment(clean.source === "event" ? 1 : 0),
          lastOrderId: orderRef.id,
          lastOrderSource: clean.source,
          lastEventId: clean.eventId || null,
          lastCustomerName: clean.customer.name || null,
          lastOrderAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      const printingSettings = normalizePrintSettings(printingSettingsSnapshot.data());
      if (printingSettings.enabled) {
        for (const profile of printingSettings.profiles) {
          if (!profile.enabled || !profile.autoPrint || !profile.tokenHash) continue;
          const printJobRef = sellerRef
            .collection("printJobs")
            .doc(`order_${orderRef.id}_${sha256(profile.id).slice(0, 12)}`);
          transaction.create(printJobRef, {
            schemaVersion: 2,
            type: "order",
            sellerId: clean.sellerId,
            profileId: profile.id,
            queueKey: profileQueueKey(profile.id, "pending"),
            orderId: orderRef.id,
            orderPath: orderRef.path,
            orderSource: clean.source,
            eventId: clean.eventId || null,
            status: "pending",
            copies: profile.copies,
            profileSnapshot: publicPrintProfile(profile),
            attempts: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: "public-order-api",
          });
        }
      }

      if (customerOrderRef && customerIdentity) {
        transaction.create(customerOrderRef, {
          schemaVersion: 1,
          customerUid: customerIdentity.uid,
          sellerId: clean.sellerId,
          eventId: clean.eventId || null,
          orderId: orderRef.id,
          orderPath: orderRef.path,
          orderSource: clean.source,
          status: initialOrderStatus,
          fulfillmentStatus: initialOrderStatus,
          customerName: clean.customer.name,
          storeName: cleanString(sellerData.storeName ?? sellerData.displayName, 160) || null,
          eventTitle: clean.source === "event"
            ? cleanString(eventData.title ?? eventData.name, 200) || null
            : null,
          currency,
          totalAmountMinor,
          offerDiscountMinor,
          rewardsDiscountMinor,
          pointsRedeemed,
          pointsToEarn: customerPointsToEarn,
          eventPointsAssigned: customerVisiblePresenterPoints,
          rewardMode: rewardEvaluation.mode,
          rewardStatus:
            customerPointsToEarn > 0 ? rewardEarnStatus : "not_eligible",
          eventRewardStatus:
            customerVisiblePresenterPoints > 0 ? rewardEarnStatus : "not_eligible",
          rewardRedemptionStatus:
            pointsRedeemed > 0 ? "committed" : "none",
          rewardRecipientType: earnRecipientType,
          rewardRecipientUid: earnRecipientUid || null,
          rewardRecipientName: earnRecipientName || null,
          totalItems: clean.totalItems,
          deliveryMode: clean.delivery.mode,
          deliveryDate: clean.delivery.date || null,
          deliveryTimeSlot: clean.delivery.time || null,
          readinessReasonCodes,
          createdAt: now,
          updatedAt: now,
        });
      }

      transaction.create(markerRef, {
        schemaVersion: 2,
        source: clean.source,
        eventId: clean.eventId || null,
        clientRequestId: clean.clientRequestId,
        requestFingerprint,
        orderId: orderRef.id,
        orderPath: orderRef.path,
        currency,
        subtotalMinor,
        discountMinor,
        shippingFeeMinor,
        totalAmountMinor,
        rewardsDiscountMinor,
        pointsRedeemed,
        pointsToEarn,
        customerPointsToEarn,
        pointsAssignedToPresenter,
        rewardRecipientType: earnRecipientType,
        rewardRecipientName: earnRecipientName || null,
        rewardMode: rewardEvaluation.mode,
        orderStatus: initialOrderStatus,
        customerOrderRefId: customerOrderRef?.id || null,
        customerRegistered: Boolean(customerIdentity),
        chatAccessToken: chatAccessToken || null,
        status: "completed",
        createdAt: now,
        expiresAt: admin.firestore.Timestamp.fromMillis(
          nowMillis + 7 * 24 * 60 * 60 * 1000,
        ),
      });

      return resultResponse({
        orderId: orderRef.id,
        source: clean.source,
        eventId: clean.eventId,
        currency,
        subtotalMinor,
        discountMinor,
        shippingFeeMinor,
        totalAmountMinor,
        orderStatus: initialOrderStatus,
        customerOrderRefId: customerOrderRef?.id || "",
        customerRegistered: Boolean(customerIdentity),
        rewardsDiscountMinor,
        pointsRedeemed,
        pointsToEarn: customerPointsToEarn,
        pointsAssignedToPresenter: customerVisiblePresenterPoints,
        rewardRecipientType: earnRecipientType,
        rewardRecipientName: earnRecipientName,
        rewardMode: rewardEvaluation.mode,
        chatAccessToken,
        replayed: false,
      });
    });

    return NextResponse.json(transactionResult, {
      status: transactionResult.replayed ? 200 : 201,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
        },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    console.error("[api/orders/create] Falha inesperada:", error);

    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_REQUEST",
        error: "Não foi possível registrar o pedido.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
