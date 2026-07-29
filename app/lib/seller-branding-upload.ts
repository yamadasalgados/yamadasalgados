"use client";

import { getApp } from "firebase/app";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

export type SellerBrandAssetKind = "logo" | "banner";

const MAX_BYTES: Record<SellerBrandAssetKind, number> = {
  logo: 5 * 1024 * 1024,
  banner: 10 * 1024 * 1024,
};

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeExtension(file: File): string {
  const type = String(file.type || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

export function validateSellerBrandAsset(
  file: File,
  kind: SellerBrandAssetKind,
): void {
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("BRAND_ASSET_MUST_BE_IMAGE");
  }

  if (file.size <= 0 || file.size > MAX_BYTES[kind]) {
    throw new Error(
      kind === "logo" ? "LOGO_FILE_TOO_LARGE" : "BANNER_FILE_TOO_LARGE",
    );
  }
}

export async function uploadSellerBrandAsset(params: {
  sellerId: string;
  kind: SellerBrandAssetKind;
  file: File;
}): Promise<string> {
  const { sellerId, kind, file } = params;
  validateSellerBrandAsset(file, kind);

  const cleanSellerId = String(sellerId || "").trim();
  if (!cleanSellerId) throw new Error("SELLER_ID_REQUIRED");

  const app = getApp();
  const storage = getStorage(app);
  const extension = safeExtension(file);
  const safeName = String(file.name || kind)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 72) || kind;
  const path = `sellers/${cleanSellerId}/branding/${kind}/${Date.now()}_${safeName}.${extension}`;
  const reference = storageRef(storage, path);

  await uploadBytes(reference, file, {
    contentType: file.type || `image/${extension}`,
    customMetadata: {
      sellerId: cleanSellerId,
      assetKind: kind,
    },
  });

  return getDownloadURL(reference);
}
