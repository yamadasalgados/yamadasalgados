export type PublicCategoryNames = {
  pt: string;
  en: string;
  ja: string;
};

export type PublicCategory = {
  id: string;
  names: PublicCategoryNames;
  parentId: string | null;
  order: number;
  capabilities: {
    mixedPackEligible: boolean;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength = 160): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizePublicCategory(id: string, value: unknown): PublicCategory {
  const raw = asRecord(value);
  const rawNames = asRecord(raw.names);
  const fallback = cleanText(raw.name, 160);
  const names: PublicCategoryNames = {
    pt: cleanText(rawNames.pt, 160),
    en: cleanText(rawNames.en, 160),
    ja: cleanText(rawNames.ja, 160),
  };
  if (!names.pt && !names.en && !names.ja && fallback) names.pt = fallback;

  const rawOrder = Number(raw.order);
  const parentId = cleanText(raw.parentId, 180);
  const capabilities = asRecord(raw.capabilities);

  return {
    id,
    names,
    parentId: parentId && parentId !== id ? parentId : null,
    order: Number.isFinite(rawOrder) ? Math.trunc(rawOrder) : 0,
    capabilities: {
      mixedPackEligible: capabilities.mixedPackEligible === true,
    },
  };
}
