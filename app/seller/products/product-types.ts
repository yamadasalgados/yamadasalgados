import type { Timestamp } from "firebase/firestore";
import type { ProductBundleConfig, ProductContent, ProductMixedPackConfig, ProductStorefrontConfig, ProductType } from "@/app/lib/product-schema";
import type { ProductShipping } from "@/app/lib/shipping-schema";
import type { ProductProductionLeadTime } from "@/app/lib/production-lead-time";
import type { ProductScheduledPriceChange, ScheduledPriceStatus } from "@/app/lib/scheduled-price";

export type CategoryId = string;
export type ProductStatus = "active" | "made_to_order" | "hidden" | "inactive";
export type PlanId = "starter" | "pro" | "business";

export type SellerCategoryNames = { pt: string; en: string; ja: string };
export type SellerCategoryCapabilities = { mixedPackEligible: boolean };
export type SellerCategoryDoc = {
  id: string;
  ownerUid: string;
  name: string;
  slug: string;
  names: SellerCategoryNames;
  parentId: string | null;
  order: number;
  tags: string[];
  capabilities: SellerCategoryCapabilities;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

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
  productType: ProductType;
  mixedPackEligible: boolean;
  mixedPackConfig: ProductMixedPackConfig;
  content: ProductContent;
  name: string;
  description?: string;
  priceMinor: number;
  basePriceMinor: number;
  effectivePriceMinor: number;
  baseSellPrice: number;
  scheduledPriceChange: ProductScheduledPriceChange;
  scheduledPriceStatus: ScheduledPriceStatus;
  costPriceMinor: number | null;
  costPrice: number;
  sellPrice: number;
  unitsPerSale: number;
  quantity: number;
  inventory: ProductInventory;
  stockQty: number;
  lowStockThreshold: number;
  shipping: ProductShipping;
  pickupEligible: boolean;
  localDeliveryEligible: boolean;
  postalEligible: boolean;
  shippingWeightGrams: number | null;
  productionLeadTime: ProductProductionLeadTime;
  productionLeadTimeDays: number;
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
  | "scheduledPrice"
  | "scheduledPriceStartsAt"
  | "quantity"
  | "stockQty"
  | "lowStockThreshold"
  | "fulfillmentOptions"
  | "shippingWeightGrams"
  | "productionLeadTimeDays"
  | "bundleTotalUnits"
  | "bundleOptions"
  | "mixedPackUnits"
  | "mixedPackOptions"
  | "mixedPackMinDistinct"
  | "mixedPackMaxPerProduct"
  | "image";

export type ProductFormErrors = Partial<Record<ProductFormField, string>>;
export type ProductSaveResult = { mode: "created" | "updated"; product: ProductDoc };
