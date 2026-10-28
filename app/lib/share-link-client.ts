/** Share/copy helpers. navigator.clipboard is unavailable on local HTTP IPs.
 * Never show success unless the browser confirms the clipboard operation. */
export async function copyTextWithFallback(value: string): Promise<boolean> {
  if (typeof window === "undefined" || !value) return false;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch { /* use fallback */ }
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  area.style.top = "0";
  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus({ preventScroll: true });
  }
}

/** Configurable public HTTPS origin for shareable URLs from local development. */
export function publicStoreOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:") return parsed.origin;
    } catch { /* invalid config: fall back */ }
  }
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function localPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol !== "https:" || host === "localhost" || host === "127.0.0.1" ||
      /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch { return true; }
}
