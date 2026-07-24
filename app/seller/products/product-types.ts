import type { Timestamp } from "firebase/firestore";

export type CategoryId = string;
export type ProductStatus = "active" | "inactive";
export type PlanId = "starter" | "pro" | "business";

export type ProductDoc = {
  id: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  ownerUid: string;
  sellerId: string;
  sellerEmail?: string | null;
  category: CategoryId;
  name: string;
  costPrice: number;
  sellPrice: number;
  quantity: number;
  stockQty: number;
  lowStockThreshold: number;
  status: ProductStatus;
  imageUrl: string;
  extraImageUrls?: string[];
};

export type ProductFormField =
  | "name"
  | "category"
  | "costPrice"
  | "sellPrice"
  | "quantity"
  | "stockQty"
  | "image";

export type ProductFormErrors = Partial<
  Record<ProductFormField, string>
>;

export type ProductSaveResult = {
  mode: "created" | "updated";
  product: ProductDoc;
};
