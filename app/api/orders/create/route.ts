import { createHash } from "node:crypto";

import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderSource = "store" | "event";
type Language = "pt" | "en" | "ja";
type Currency = "JPY" | "BRL" | "USD";
type DeliveryMode = "pickup" | "delivery" | "none";
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
  };
};

type OrderErrorCode =
  | "INVALID_REQUEST"
  | "SELLER_UNAVAILABLE"
  | "EVENT_UNAVAILABLE"
  | "PRODUCT_UNAVAILABLE"
  | "OFFER_UNAVAILABLE"
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
  stockAvailable: number | null;
  stockShortage: number;
  stockState: "available" | "insufficient" | "not_tracked" | "made_to_order";
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
  return value === "delivery" || value === "none" ? value : "pickup";
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
      mode: cleanDeliveryMode(delivery.mode),
      date: cleanString(delivery.date, 80),
      time: cleanString(delivery.time, 100),
      address: cleanString(delivery.address, 1000),
      locationLink: cleanString(delivery.locationLink, 2000),
      note: cleanString(delivery.note, 1500),
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
  currency: Currency;
  language: Language;
  defaultLanguage: Language;
  source: OrderSource;
}): ProductLine {
  const {
    productId,
    quantity,
    raw,
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
  const disabled =
    raw.active === false ||
    raw.enabled === false ||
    status === "inactive" ||
    status === "archived" ||
    status === "cancelled";

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

  const inventory = record(raw.inventory);
  const inventoryTracked =
    typeof inventory.tracked === "boolean" ? inventory.tracked : true;
  const stockCandidate =
    typeof inventory.quantity === "number"
      ? inventory.quantity
      : typeof raw.stockQty === "number"
        ? raw.stockQty
        : typeof raw.stock === "number"
          ? raw.stock
          : null;

  const normalizedStock =
    stockCandidate !== null && Number.isFinite(stockCandidate)
      ? Math.max(0, Math.floor(stockCandidate))
      : null;
  const stockShortage =
    !madeToOrder && inventoryTracked && normalizedStock !== null
      ? Math.max(0, quantity - normalizedStock)
      : 0;
  const stockState: ProductLine["stockState"] = madeToOrder
    ? "made_to_order"
    : !inventoryTracked || normalizedStock === null
      ? "not_tracked"
      : stockShortage > 0
        ? "insufficient"
        : "available";

  const fallbackName = source === "event" ? productId : `Produto ${productId}`;

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
    stockAvailable: normalizedStock,
    stockShortage,
    stockState,
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
    totalAmountMinor: params.totalAmountMinor,
    subtotal: minorToMajor(params.subtotalMinor, params.currency),
    discount: minorToMajor(params.discountMinor, params.currency),
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
    const productRefs = Object.keys(clean.quantities).map((productId) =>
      clean.source === "event"
        ? eventRef!.collection("items").doc(productId)
        : sellerRef.collection("products").doc(productId),
    );
    const offerRef = clean.selectedOfferId
      ? clean.source === "event"
        ? eventRef!.collection("offers").doc(clean.selectedOfferId)
        : sellerRef.collection("offers").doc(clean.selectedOfferId)
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
      refs.push(...productRefs);
      if (offerRef) refs.push(offerRef);

      const snapshots = await transaction.getAll(...refs);
      let cursor = 0;
      const markerSnapshot = snapshots[cursor++];
      const sellerSnapshot = snapshots[cursor++];
      const eventSnapshot = eventRef ? snapshots[cursor++] : null;
      const productSnapshots = productRefs.map(() => snapshots[cursor++]);
      const offerSnapshot = offerRef ? snapshots[cursor++] : null;

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

      const productIds = Object.keys(clean.quantities);
      const lines: ProductLine[] = [];

      for (let index = 0; index < productSnapshots.length; index += 1) {
        const snapshot = productSnapshots[index];
        if (!snapshot.exists) {
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
            raw: snapshot.data() ?? {},
            currency,
            language: clean.language,
            defaultLanguage,
            source: clean.source,
          }),
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
      const totalAmountMinor = Math.max(0, subtotalMinor - discountMinor);
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
      const items = lines.map((line) => ({
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
        stockShortage: line.stockShortage,
        stockState: line.stockState,
      }));
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
        totalAmountMinor,
        subtotal: minorToMajor(subtotalMinor, currency),
        discount: minorToMajor(discountMinor, currency),
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
        channel: clean.source === "store" ? "store" : "pwa",
        deliveryMode: clean.delivery.mode,
        deliveryDate: clean.delivery.date || null,
        deliveryTimeSlot: clean.delivery.time || null,
        address: clean.delivery.address || null,
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
