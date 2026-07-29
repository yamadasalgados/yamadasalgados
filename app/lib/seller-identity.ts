export const DEFAULT_BRAND_PRIMARY_COLOR = "#f97316";
export const DEFAULT_BRAND_ACCENT_COLOR = "#111827";

export type SellerContactIdentity = {
  phone: string;
  email: string;
  whatsapp: string;
  instagram: string;
  website: string;
};

export type SellerReceiptIdentity = {
  headerText: string;
  footerText: string;
};

export type SellerIdentity = {
  schemaVersion: 1;
  storeName: string;
  storeDescription: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  accentColor: string;
  contact: SellerContactIdentity;
  receipt: SellerReceiptIdentity;
};

export const EMPTY_SELLER_IDENTITY: SellerIdentity = {
  schemaVersion: 1,
  storeName: "",
  storeDescription: "",
  logoUrl: "",
  bannerUrl: "",
  primaryColor: DEFAULT_BRAND_PRIMARY_COLOR,
  accentColor: DEFAULT_BRAND_ACCENT_COLOR,
  contact: {
    phone: "",
    email: "",
    whatsapp: "",
    instagram: "",
    website: "",
  },
  receipt: {
    headerText: "",
    footerText: "",
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeHexColor(
  value: unknown,
  fallback: string,
): string {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate)
    ? candidate.toLowerCase()
    : fallback;
}

export function normalizeSellerIdentity(value: unknown): SellerIdentity {
  const data = asRecord(value);
  const contact = asRecord(data.contact);
  const receipt = asRecord(data.receiptIdentity ?? data.receipt);

  return {
    schemaVersion: 1,
    storeName:
      cleanText(data.storeName, 120) ||
      cleanText(data.businessName, 120) ||
      cleanText(data.publicName, 120),
    storeDescription:
      cleanText(data.storeDescription, 1200) ||
      cleanText(data.description, 1200),
    logoUrl:
      cleanText(data.logoUrl, 1500) ||
      cleanText(data.photoUrl ?? data.photoURL, 1500),
    bannerUrl:
      cleanText(data.bannerUrl, 1500) ||
      cleanText(data.coverUrl, 1500),
    primaryColor: normalizeHexColor(
      data.brandPrimaryColor ?? data.primaryColor,
      DEFAULT_BRAND_PRIMARY_COLOR,
    ),
    accentColor: normalizeHexColor(
      data.brandAccentColor ?? data.accentColor,
      DEFAULT_BRAND_ACCENT_COLOR,
    ),
    contact: {
      phone: cleanText(contact.phone ?? data.phone, 80),
      email: cleanText(contact.email ?? data.publicEmail, 180),
      whatsapp: cleanText(contact.whatsapp ?? data.whatsapp, 80),
      instagram: cleanText(contact.instagram ?? data.instagram, 180),
      website: cleanText(contact.website ?? data.website, 500),
    },
    receipt: {
      headerText: cleanText(receipt.headerText, 500),
      footerText: cleanText(receipt.footerText, 1000),
    },
  };
}

export function sellerIdentityWritePayload(identity: SellerIdentity) {
  return {
    identitySchemaVersion: 1,
    storeName: cleanText(identity.storeName, 120),
    storeDescription: cleanText(identity.storeDescription, 1200),
    logoUrl: cleanText(identity.logoUrl, 1500),
    bannerUrl: cleanText(identity.bannerUrl, 1500),
    brandPrimaryColor: normalizeHexColor(
      identity.primaryColor,
      DEFAULT_BRAND_PRIMARY_COLOR,
    ),
    brandAccentColor: normalizeHexColor(
      identity.accentColor,
      DEFAULT_BRAND_ACCENT_COLOR,
    ),
    contact: {
      phone: cleanText(identity.contact.phone, 80),
      email: cleanText(identity.contact.email, 180),
      whatsapp: cleanText(identity.contact.whatsapp, 80),
      instagram: cleanText(identity.contact.instagram, 180),
      website: cleanText(identity.contact.website, 500),
    },
    // Mantido como espelho temporário para telas/eventos antigos.
    whatsapp: cleanText(identity.contact.whatsapp, 80) || null,
    receiptIdentity: {
      headerText: cleanText(identity.receipt.headerText, 500),
      footerText: cleanText(identity.receipt.footerText, 1000),
    },
  };
}

export function sellerInitials(name: string): string {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) return "S";
  return words.map((word) => word[0]?.toUpperCase() || "").join("");
}
