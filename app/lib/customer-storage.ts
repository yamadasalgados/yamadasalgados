"use client";

import { EMPTY_CUSTOMER_ADDRESS, normalizeCustomerAddress, type CustomerAddressProfile } from "@/app/lib/customer-profile";

export type StoredCustomerProfile = {
  name: string;
  phone: string;
  email: string;
  address: CustomerAddressProfile;
};

const CLIENT_ID_KEY = "order_system_customer_id";
const PROFILE_KEY = "order-system:customer:profile:v1";
const LEGACY_CLIENT_ID_KEY = "yamada_customer_id";
const LEGACY_PROFILE_KEY = "yamada:customer:profile:v1";

function randomClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `c_${crypto.randomUUID()}`;
  }

  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export function getOrCreateCustomerClientId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY)?.trim();
    if (existing) return existing;
    const legacy = window.localStorage.getItem(LEGACY_CLIENT_ID_KEY)?.trim();
    if (legacy) {
      try { window.localStorage.setItem(CLIENT_ID_KEY, legacy); } catch {}
      return legacy;
    }

    const created = randomClientId();
    window.localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return randomClientId();
  }
}

export function readStoredCustomerProfile(): StoredCustomerProfile {
  if (typeof window === "undefined") {
    return { name: "", phone: "", email: "", address: { ...EMPTY_CUSTOMER_ADDRESS } };
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_KEY) || window.localStorage.getItem(LEGACY_PROFILE_KEY) || "{}";
    if (!window.localStorage.getItem(PROFILE_KEY) && raw !== "{}") {
      try { window.localStorage.setItem(PROFILE_KEY, raw); } catch {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 120) : "",
      phone: typeof parsed.phone === "string" ? parsed.phone.slice(0, 50) : "",
      email: typeof parsed.email === "string" ? parsed.email.slice(0, 200) : "",
      address: normalizeCustomerAddress(parsed.address),
    };
  } catch {
    return { name: "", phone: "", email: "", address: { ...EMPTY_CUSTOMER_ADDRESS } };
  }
}

export function writeStoredCustomerProfile(profile: Partial<StoredCustomerProfile>): void {
  if (typeof window === "undefined") return;

  try {
    const current = readStoredCustomerProfile();
    window.localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        name: typeof profile.name === "string" ? profile.name.trim().slice(0, 120) : current.name,
        phone: typeof profile.phone === "string" ? profile.phone.trim().slice(0, 50) : current.phone,
        email: typeof profile.email === "string" ? profile.email.trim().slice(0, 200) : current.email,
        address: profile.address
          ? normalizeCustomerAddress({ ...current.address, ...profile.address })
          : current.address,
      }),
    );
  } catch {
    // Local storage is a convenience; checkout still works without it.
  }
}

export function storeDraftKey(sellerId: string): string {
  return `order-system:store:${sellerId.trim()}:draft:v1`;
}

export function eventDraftKey(sellerId: string, eventId: string): string {
  return `order-system:event:${sellerId.trim()}:${eventId.trim()}:draft:v1`;
}

function legacyDraftKey(key: string): string {
  if (key.startsWith("order-system:store:")) return key.replace("order-system:store:", "yamada:store:");
  if (key.startsWith("order-system:event:")) return key.replace("order-system:event:", "yamada:event:");
  return "";
}

export function readLocalDraft<T>(key: string): T | null {
  if (typeof window === "undefined" || !key) return null;

  try {
    const legacyKey = legacyDraftKey(key);
    const raw = window.localStorage.getItem(key) || (legacyKey ? window.localStorage.getItem(legacyKey) : null);
    if (raw && !window.localStorage.getItem(key)) { try { window.localStorage.setItem(key, raw); } catch {} }
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(key: string, value: unknown): void {
  if (typeof window === "undefined" || !key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Draft persistence is best-effort only.
  }
}

export function removeLocalDraft(key: string): void {
  if (typeof window === "undefined" || !key) return;

  try {
    window.localStorage.removeItem(key);
    const legacyKey = legacyDraftKey(key);
    if (legacyKey) window.localStorage.removeItem(legacyKey);
  } catch {
    // Ignore unavailable storage.
  }
}
