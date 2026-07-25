"use client";

import { EMPTY_CUSTOMER_ADDRESS, normalizeCustomerAddress, type CustomerAddressProfile } from "@/app/lib/customer-profile";

export type StoredCustomerProfile = {
  name: string;
  phone: string;
  email: string;
  address: CustomerAddressProfile;
};

const CLIENT_ID_KEY = "yamada_customer_id";
const PROFILE_KEY = "yamada:customer:profile:v1";

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
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || "{}") as Record<string, unknown>;
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
  return `yamada:store:${sellerId.trim()}:draft:v1`;
}

export function eventDraftKey(sellerId: string, eventId: string): string {
  return `yamada:event:${sellerId.trim()}:${eventId.trim()}:draft:v1`;
}

export function readLocalDraft<T>(key: string): T | null {
  if (typeof window === "undefined" || !key) return null;

  try {
    const raw = window.localStorage.getItem(key);
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
  } catch {
    // Ignore unavailable storage.
  }
}
