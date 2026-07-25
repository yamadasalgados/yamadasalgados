import { createHash } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import {
  evaluatePostalShipping,
  normalizeProductShipping,
  normalizeSellerShippingSettings,
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
  totalItems: number;
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
  | "IDEMPOTENCY_CONFLICT"
  | "TOO_MANY_REQUESTS";

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
  stockState: "available" | "insufficient" | "not_tracked" | "made_to_order";
  shipping: {
    postalEligible: boolean;
    weightGrams: number | null;
  };
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

function cleanRequest(value: unknown): CleanOrderRequest {
  const raw = record(value) as PublicOrderRequest;
  const source = cleanSource(raw.source);
  const sellerId = cleanString(raw.sellerId, 160);
  const eventId = cleanString(raw.eventId, 160);
  const clientRequestId = cleanString(raw.clientRequestId, 160);
  const customer = record(raw.customer);
  const delivery = record(raw.delivery);
  const shipping = record(delivery.shipping);
  const { quantities, totalItems } = cleanQuantities(raw.quantities);

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
    totalItems,
    customer: {
      name: customerName,
      phone: customerPhone,
      email: cleanString(customer.email, 200),
    },
    delivery: {
      mode: deliveryMode,
      date: cleanString(delivery.date, 80),
      time: cleanString(delivery.time, 100),
      address: cleanString(delivery.address, 1000),
      locationLink: cleanString(delivery.locationLink, 2000),
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

  const priceMinor =
    typeof raw.priceMinor === "number" && Number.isFinite(raw.priceMinor)
      ? Math.max(0, Math.round(raw.priceMinor))
      : majorToMinor(raw.sellPrice ?? raw.price ?? raw.shadowSell, currency);

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
  );

  return {
    productId,
    quantity,
    priceMinor,
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
    const db = getAdminDb();
    const now = admin.firestore.Timestamp.now();
    const nowMillis = now.toMillis();
    const sellerRef = db.collection("sellers").doc(clean.sellerId);
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
    const offerRef = clean.selectedOfferId
      ? clean.source === "event"
        ? eventRef!.collection("offers").doc(clean.selectedOfferId)
        : sellerRef.collection("offers").doc(clean.selectedOfferId)
      : null;
    const shippingSettingsRef =
      clean.source === "store" && clean.delivery.mode === "postal"
        ? sellerRef.collection("settings").doc("shipping")
        : null;

    const fingerprintPayload = {
      source: clean.source,
      sellerId: clean.sellerId,
      eventId: clean.eventId,
      language: clean.language,
      selectedOfferId: clean.selectedOfferId,
      customerClientId: clean.customerClientId,
      quantities: clean.quantities,
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

    const transactionResult = await db.runTransaction(async (transaction) => {
      const refs: admin.firestore.DocumentReference[] = [markerRef, sellerRef];
      if (eventRef) refs.push(eventRef);
      refs.push(...orderItemRefs);
      if (clean.source === "event") refs.push(...catalogProductRefs);
      if (offerRef) refs.push(offerRef);
      if (shippingSettingsRef) refs.push(shippingSettingsRef);

      const snapshots = await transaction.getAll(...refs);
      let cursor = 0;
      const markerSnapshot = snapshots[cursor++];
      const sellerSnapshot = snapshots[cursor++];
      const eventSnapshot = eventRef ? snapshots[cursor++] : null;
      const orderItemSnapshots = orderItemRefs.map(() => snapshots[cursor++]);
      const catalogProductSnapshots = clean.source === "event"
        ? catalogProductRefs.map(() => snapshots[cursor++])
        : orderItemSnapshots;
      const offerSnapshot = offerRef ? snapshots[cursor++] : null;
      const shippingSettingsSnapshot = shippingSettingsRef ? snapshots[cursor++] : null;

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

      const sellerRegional = record(sellerData.regional);
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
          }),
        );
      }

      const unavailableStockLines = lines.filter(
        (line) =>
          line.availabilityMode !== "made_to_order" &&
          line.inventoryTracked &&
          line.stockShortage > 0,
      );

      if (unavailableStockLines.length > 0) {
        throw new OrderError(
          "PRODUCT_UNAVAILABLE",
          unavailableStockLines.length === 1
            ? `${unavailableStockLines[0].name} não possui estoque suficiente para esta quantidade.`
            : "Um ou mais produtos não possuem estoque suficiente. Atualize a página e ajuste o carrinho.",
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

      let shippingFeeMinor = 0;
      let shippingSnapshot: Record<string, unknown> | null = null;

      if (clean.delivery.mode === "postal") {
        if (!shippingSettingsSnapshot?.exists) {
          throw new OrderError(
            "SHIPPING_UNAVAILABLE",
            "O envio por correio não está configurado.",
            409,
          );
        }

        const shippingSettings = normalizeSellerShippingSettings(
          shippingSettingsSnapshot.data() ?? {},
        );
        const shippingEvaluation = evaluatePostalShipping({
          settings: shippingSettings,
          products: lines.map((line) => ({
            quantity: line.quantity,
            shipping: line.shipping,
          })),
        });

        if (!shippingEvaluation.available) {
          const message =
            shippingEvaluation.reason === "product_not_eligible"
              ? "Um dos produtos não pode ser enviado por correio."
              : shippingEvaluation.reason === "weight_missing"
                ? "Um dos produtos não possui peso para calcular o frete."
                : shippingEvaluation.reason === "weight_limit_exceeded"
                  ? "O peso do pedido excede as faixas de frete configuradas."
                  : "O envio por correio não está disponível.";

          throw new OrderError("SHIPPING_UNAVAILABLE", message, 409);
        }

        shippingFeeMinor = shippingEvaluation.shippingFeeMinor ?? 0;
        shippingSnapshot = {
          schemaVersion: 2,
          pricingMode: shippingEvaluation.pricingMode,
          quoteStatus: shippingEvaluation.quoteStatus,
          recipientName: clean.delivery.shipping.recipientName,
          postalCode: clean.delivery.shipping.postalCode,
          prefecture: clean.delivery.shipping.prefecture,
          city: clean.delivery.shipping.city,
          addressLine1: clean.delivery.shipping.addressLine1,
          addressLine2: clean.delivery.shipping.addressLine2 || null,
          totalWeightGrams: shippingEvaluation.totalWeightGrams,
          shippingFeeMinor:
            shippingEvaluation.shippingFeeMinor === null
              ? null
              : shippingEvaluation.shippingFeeMinor,
          shippingFee:
            shippingEvaluation.shippingFeeMinor === null
              ? null
              : minorToMajor(shippingEvaluation.shippingFeeMinor, currency),
          appliedBand: shippingEvaluation.appliedBand,
          pricingSnapshot: {
            postalEnabled: shippingSettings.postalEnabled,
            pricingMode: shippingSettings.pricingMode,
            weightBands: shippingSettings.weightBands,
            instructions: shippingSettings.instructions,
          },
        };
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
          stockState: line.stockState,
          inventoryState: {
            reservationStatus,
            reservedQuantity: line.stockReserved,
            shortageQuantity: line.stockShortage,
            productionRequired: line.productionRequired,
            producedQuantity: 0,
            consumedQuantity: 0,
            releasedQuantity: 0,
            productionStatus:
              line.availabilityMode === "made_to_order"
                ? "pending"
                : "not_required",
          },
          shipping: line.shipping,
          postalEligible: line.shipping.postalEligible,
          shippingWeightGrams: line.shipping.weightGrams,
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
        quantities,
        items,
        totalItems: clean.totalItems,
        subtotalMinor,
        discountMinor,
        shippingFeeMinor,
        totalAmountMinor,
        subtotal: minorToMajor(subtotalMinor, currency),
        discount: minorToMajor(discountMinor, currency),
        shippingFee: minorToMajor(shippingFeeMinor, currency),
        deliveryFee: minorToMajor(shippingFeeMinor, currency),
        totalAmount: minorToMajor(totalAmountMinor, currency),
        offersApplied,
        selectedOfferId: clean.selectedOfferId || null,
        status: initialOrderStatus,
        fulfillmentStatus: initialOrderStatus,
        readiness: {
          hasMadeToOrderItems,
          hasStockShortage,
          reasonCodes: readinessReasonCodes,
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

      transaction.create(orderRef, orderPayload);
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
        orderStatus: initialOrderStatus,
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
