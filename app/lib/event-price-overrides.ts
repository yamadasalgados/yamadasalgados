import { majorToMinor, minorToMajor } from "@/app/lib/money";
import type { SupportedCurrency } from "@/app/types/regional";

/** Seller-controlled, event-scoped prices in the currency's smallest unit.
 * Missing key => current catalog/scheduled price. No client price is trusted at checkout.
 */
export const MAX_EVENT_PRICE_MINOR = 2_000_000_000;

export function readEventPriceOverrides(value: unknown): Record<string, number> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [productId, price] of Object.entries(value).slice(0, 300)) {
    if (!productId || productId.length > 160 || productId.includes("/")) continue;
    if (typeof price !== "number" || !Number.isSafeInteger(price) ||
        price <= 0 || price > MAX_EVENT_PRICE_MINOR) continue;
    Object.defineProperty(result, productId, { value: price, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

export function eventPriceInputFromMinor(price: number, currency: SupportedCurrency): string {
  return String(minorToMajor(price, currency));
}

/** A blank input deliberately removes the event override. Throws on invalid entered prices. */
export function prepareEventPriceOverrides(
  inputs: Record<string, string>,
  selectedProductIds: string[],
  currency: SupportedCurrency,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const productId of selectedProductIds) {
    const raw = (inputs[productId] ?? "").trim();
    if (!raw) continue;
    const decimal = raw.replace(",", ".");
    // Prevent Number('1e8'), Infinity, spaces, or silently rounded extra decimals.
    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(decimal)) {
      throw new Error(`Preço do evento inválido para o produto ${productId}.`);
    }
    if (currency === "JPY" && decimal.includes(".")) {
      throw new Error(`O preço em ienes deve ser inteiro (${productId}).`);
    }
    const amount = Number(decimal);
    const priceMinor = majorToMinor(amount, currency);
    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0 ||
        priceMinor > MAX_EVENT_PRICE_MINOR ||
        Math.abs(minorToMajor(priceMinor, currency) - amount) > 0.000001) {
      throw new Error(`Preço do evento fora do intervalo permitido (${productId}).`);
    }
    Object.defineProperty(result, productId, { value: priceMinor, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
