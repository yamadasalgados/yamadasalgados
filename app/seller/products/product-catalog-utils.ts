import { getApp } from "firebase/app";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

export function toNum(input: unknown): number {
  const normalized = String(input ?? "")
    .trim()
    .replace(",", ".");
  const value = Number(normalized);

  return Number.isFinite(value)
    ? value
    : Number.NaN;
}

function safeExtFromType(type: string): string {
  const normalized = String(type || "").toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";

  return "jpg";
}

export async function uploadImageFile(params: {
  uid: string;
  productIdLike: string;
  file: File;
}): Promise<string> {
  const { uid, productIdLike, file } = params;
  const app = getApp();
  const storage = getStorage(app);
  const extension = safeExtFromType(file.type);
  const timestamp = Date.now();
  const cleanName = String(file.name || "image")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);

  // Mantém exatamente o caminho de upload já usado antes da refatoração.
  const path = `sellers/${uid}/products/${productIdLike}/${timestamp}_${cleanName}.${extension}`;
  const reference = storageRef(storage, path);

  await uploadBytes(reference, file);

  return getDownloadURL(reference);
}

function hashText(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function slugify(input: string): string {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const asciiSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  if (asciiSlug) return asciiSlug;

  return `category-${hashText(normalized || "category")}`;
}

export function normalizeCategoryLabel(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

export function categoryKey(input: string): string {
  return normalizeCategoryLabel(input)
    .normalize("NFKC")
    .toLocaleLowerCase();
}

export function mergeCategoryLabels(
  ...groups: string[][]
): string[] {
  const result = new Map<string, string>();

  for (const group of groups) {
    for (const rawName of group) {
      const label = normalizeCategoryLabel(rawName);
      const key = categoryKey(label);

      if (label && key && !result.has(key)) {
        result.set(key, label);
      }
    }
  }

  return Array.from(result.values());
}
