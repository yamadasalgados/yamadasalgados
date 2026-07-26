import type { Timestamp } from "firebase/firestore";
import type { ProductBundleConfig, ProductContent, ProductStorefrontConfig } from "@/app/lib/product-schema";
import type { ProductShipping } from "@/app/lib/shipping-schema";

export type CategoryId = string;
export type ProductStatus = "active" | "made_to_order" | "hidden" | "inactive";
export type PlanId = "starter" | "pro" | "business";

export type ProductInventory = {
  tracked: boolean;
  quantity: number;
  reserved: number;
  available?: number;
  lowStockThreshold: number;
};

export type ProductDoc = {
  id: string;
  schemaVersion: 2;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ownerUid: string;
  sellerId: string;
  sellerEmail?: string | null;
  categoryId: CategoryId;
  category: string;
  content: ProductContent;
  name: string;
  description?: string;
  priceMinor: number;
  costPriceMinor: number | null;
  costPrice: number;
  sellPrice: number;
  unitsPerSale: number;
  quantity: number;
  inventory: ProductInventory;
  stockQty: number;
  lowStockThreshold: number;
  shipping: ProductShipping;
  postalEligible: boolean;
  shippingWeightGrams: number | null;
  status: ProductStatus;
  imageUrl: string;
  extraImageUrls?: string[];
  bundleConfig: ProductBundleConfig;
  storefront: ProductStorefrontConfig;
};

export type ProductFormField =
  | "name"
  | "category"
  | "costPrice"
  | "sellPrice"
  | "quantity"
  | "stockQty"
  | "lowStockThreshold"
  | "shippingWeightGrams"
  | "bundleTotalUnits"
  | "bundleOptions"
  | "image";

export type ProductFormErrors = Partial<Record<ProductFormField, string>>;
export type ProductSaveResult = { mode: "created" | "updated"; product: ProductDoc };
