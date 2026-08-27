import { NextResponse } from "next/server";

import { getAdminDb } from "@/app/lib/firebaseAdmin";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import {
  legacyMajorValueToMinor,
  minorToMajor,
} from "@/app/lib/money";
import { normalizePublicSellerProfile } from "@/app/lib/public-seller-profile";
import {
  normalizeProductProductionLeadTime,
} from "@/app/lib/production-lead-time";
import {
  evaluateProductPrice,
  resolveProductScheduledPriceChange,
} from "@/app/lib/scheduled-price";
import type { SupportedCurrency } from "@/app/types/regional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanPathId(value: string, errorCode: string): string {
  const normalized = decodeURIComponent(value || "").trim();
  if (
    !normalized ||
    normalized.length > 180 ||
    normalized.includes("/") ||
    /[\u0000-\u001F]/.test(normalized)
  ) {
    throw new Error(errorCode);
  }
  return normalized;
}

function cleanString(value: unknown, maxLength = 500): string {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function cleanStringArray(value: unknown, maxItems = 24): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems),
    ),
  );
}

function eventIsPublic(event: UnknownRecord): boolean {
  return (
    cleanString(event.status, 40) === "active" &&
    event.isActive !== false
  );
}

function eventProductMode(
  productId: string,
  event: UnknownRecord,
  eventItem: UnknownRecord,
): "normal" | "made_to_order" {
  const modes = asRecord(event.productAvailabilityModes);
  const configured = modes[productId];
  if (configured === "made_to_order" || configured === "normal") {
    return configured;
  }

  if (
    eventItem.availabilityMode === "made_to_order" ||
    eventItem.availabilityStatus === "made_to_order" ||
    eventItem.productionMode === "made_to_order"
  ) {
    return "made_to_order";
  }

  return "normal";
}

function sellerCurrency(seller: UnknownRecord, event: UnknownRecord): SupportedCurrency {
  const eventCurrency = event.currency;
  if (eventCurrency === "JPY" || eventCurrency === "BRL" || eventCurrency === "USD") {
    return eventCurrency;
  }

  const regional = asRecord(seller.regional);
  const currency = regional.currency ?? seller.currency;
  if (currency === "BRL" || currency === "USD") return currency;
  return "JPY";
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ sellerId: string; eventId: string }>;
  },
) {
  try {
    const params = await context.params;
    const sellerId = cleanPathId(params.sellerId, "INVALID_SELLER_ID");
    const eventId = cleanPathId(params.eventId, "INVALID_EVENT_ID");
    const db = getAdminDb();

    const [sellerSnapshot, eventSnapshot] = await Promise.all([
      db.collection("sellers").doc(sellerId).get(),
      db.collection("sellers").doc(sellerId).collection("events").doc(eventId).get(),
    ]);

    if (!sellerSnapshot.exists || !eventSnapshot.exists) {
      return NextResponse.json(
        { ok: false, error: "Evento não encontrado." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const seller = asRecord(sellerSnapshot.data());
    const event = asRecord(eventSnapshot.data());
    const sellerProfile = normalizePublicSellerProfile(sellerId, seller);
    const onboarding = asRecord(seller.onboarding);

    if (!sellerProfile.available || onboarding.complete !== true || !eventIsPublic(event)) {
      return NextResponse.json(
        { ok: false, error: "Evento indisponível." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const eventRef = db.collection("sellers").doc(sellerId).collection("events").doc(eventId);
    const [itemsSnapshot, legacyProductsSnapshot] = await Promise.all([
      eventRef.collection("items").get(),
      eventRef.collection("products").get(),
    ]);

    const itemDataById = new Map<string, UnknownRecord>();
    itemsSnapshot.docs.forEach((document) => {
      itemDataById.set(document.id, asRecord(document.data()));
    });
    legacyProductsSnapshot.docs.forEach((document) => {
      if (!itemDataById.has(document.id)) {
        itemDataById.set(document.id, asRecord(document.data()));
      }
    });

    const publishedIds = Array.from(
      new Set([
        ...cleanStringArray(event.productIds, 300),
        ...cleanStringArray(event.featuredProductIds, 300),
        ...Array.from(itemDataById.keys()),
      ]),
    ).slice(0, 300);

    if (publishedIds.length === 0) {
      return NextResponse.json(
        { ok: true, products: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const catalog = db.collection("sellers").doc(sellerId).collection("products");
    const productSnapshots = await db.getAll(
      ...publishedIds.map((productId) => catalog.doc(productId)),
    );
    const currency = sellerCurrency(seller, event);

    const products = productSnapshots.flatMap((snapshot) => {
      if (!snapshot.exists) return [];
      const productId = snapshot.id;
      const raw = asRecord(snapshot.data());

      // `hidden` significa somente "não listar na loja permanente".
      // Este endpoint nunca abre produtos ocultos aleatórios: somente IDs já
      // publicados neste evento são considerados.
      if (raw.status !== "hidden" || raw.enabled === false) return [];

      const inventory = normalizeProductInventory(
        raw.inventory,
        raw.stockQty ?? raw.stock,
        raw.lowStockThreshold,
      );
      const availabilityMode = eventProductMode(
        productId,
        event,
        itemDataById.get(productId) ?? {},
      );
      const madeToOrder = availabilityMode === "made_to_order";
      const basePriceMinor =
        typeof raw.priceMinor === "number" && Number.isFinite(raw.priceMinor)
          ? Math.max(0, Math.round(raw.priceMinor))
          : legacyMajorValueToMinor(
              raw.sellPrice ?? raw.price ?? 0,
              currency,
            );
      const scheduledPriceChange = resolveProductScheduledPriceChange(raw, currency);
      const priceEvaluation = evaluateProductPrice({
        basePriceMinor,
        scheduledPriceChange,
        currency,
      });
      const leadTime = normalizeProductProductionLeadTime(
        raw.productionLeadTime,
        raw.productionLeadTimeDays,
        { madeToOrder },
      ).days;

      return [
        {
          id: productId,
          name: cleanString(raw.name, 240) || productId,
          imageUrl: cleanString(raw.imageUrl ?? raw.image, 1800),
          extraImageUrls: cleanStringArray(raw.extraImageUrls, 12),
          price: minorToMajor(priceEvaluation.effectivePriceMinor, currency),
          priceMinor: priceEvaluation.effectivePriceMinor,
          basePriceMinor,
          scheduledPriceChange: priceEvaluation.scheduledPriceChange,
          scheduledPriceStatus: priceEvaluation.status,
          category: cleanString(raw.category, 240) || undefined,
          stockQty: inventory.tracked ? inventory.available : undefined,
          lowStockThreshold: inventory.lowStockThreshold,
          status: madeToOrder ? "made_to_order" : "active",
          availabilityMode,
          availabilityStatus: madeToOrder ? "made_to_order" : "active",
          productionMode: madeToOrder ? "made_to_order" : "stock",
          productionLeadTimeDays: leadTime,
        },
      ];
    });

    return NextResponse.json(
      { ok: true, products },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const invalid = code === "INVALID_SELLER_ID" || code === "INVALID_EVENT_ID";
    if (!invalid) {
      console.error("[api/public/events/products] Unexpected error:", error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: invalid
          ? "Evento inválido."
          : "Não foi possível carregar os produtos do evento.",
      },
      {
        status: invalid ? 400 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
