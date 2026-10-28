/**
 * Identidade de loja visitada, isolada pelo UID do cliente.
 * Não usar a chave global legada: contas distintas compartilham localStorage
 * no mesmo navegador e uma URL antiga pode redirecionar para /login.
 */
const PREFIX = "order_system_customer_store_by_uid_v63:";
const FALLBACK = "/customer/stores";

export function normalizeCustomerStoreHref(value: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const text = value.trim();
    if (text.startsWith("//") || text.includes("\\")) return null;
    const url = new URL(text, "https://order-system.invalid");
    if (!(["http:", "https:"].includes(url.protocol))) return null;
    const match = url.pathname.match(/^\/store\/([a-zA-Z0-9_-]{4,150})\/?$/);
    return match ? `/store/${match[1]}` : null;
  } catch {
    return null;
  }
}

export function readCustomerStoreContext(uid: string | null | undefined): { storeHref: string; sellerId: string } {
  if (!uid || typeof window === "undefined") return { storeHref: FALLBACK, sellerId: "" };
  try {
    const storeHref = normalizeCustomerStoreHref(window.localStorage.getItem(`${PREFIX}${uid}`) || "");
    if (!storeHref) return { storeHref: FALLBACK, sellerId: "" };
    return { storeHref, sellerId: storeHref.substring("/store/".length) };
  } catch {
    return { storeHref: FALLBACK, sellerId: "" };
  }
}

export function rememberCustomerStoreContext(uid: string | null | undefined, href: string): void {
  if (!uid || typeof window === "undefined") return;
  const normalized = normalizeCustomerStoreHref(href);
  if (!normalized) return;
  try {
    window.localStorage.setItem(`${PREFIX}${uid}`, normalized);
  } catch {
    // Navegação pública continua funcionando sem localStorage.
  }
}
