import type { Timestamp } from "firebase/firestore";

import type {
  AppliedOfferSnapshot,
} from "@/app/lib/offer-schema";

import {
  ORDER_STATUS,
  type OrderStatus,
} from "@/app/lib/order-status";

export const STORE_ORDER_STATUS =
  ORDER_STATUS;

export type StoreOrderStatus =
  OrderStatus;

export type StoreOrderErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_ORDER_ID"
  | "ORDER_NOT_FOUND"
  | "ORDER_LOAD_FAILED"
  | "STATUS_UPDATE_FAILED";

export interface StoreOrderTimestampLike {
  toDate: () => Date;
}

export type StoreOrderDate =
  | Timestamp
  | StoreOrderTimestampLike
  | Date
  | string
  | number
  | null;

export type StoreOrderDeliveryMode =
  | "pickup"
  | "delivery"
  | "postal"
  | "none";

export type StoreOrderPostalPricingMode =
  | "collect"
  | "arrange"
  | "weight_table";

export interface StoreOrderShipping {
  pricingMode: StoreOrderPostalPricingMode;
  quoteStatus: "collect" | "pending" | "calculated" | "unavailable";
  recipientName?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string;
  totalWeightGrams?: number | null;
  shippingFeeMinor?: number | null;
  shippingFee?: number | null;
  instructions?: string;
}


export interface StoreOrderFulfillment {
  schemaVersion?: number;
  method: "pickup" | "delivery" | "postal";
  label?: string;
  description?: string;
  instructions?: string;
  feeMinor?: number | null;
  fee?: number | null;
  quoteStatus?: "calculated" | "region_required" | "collect" | "pending" | "unavailable";
  minimumOrderMinor?: number | null;
  freeAboveMinor?: number | null;
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
  regionId?: string | null;
  regionName?: string | null;
  pricingMode?: StoreOrderPostalPricingMode;
  totalWeightGrams?: number | null;
}

export type StoreOrderReservationStatus =
  | "none"
  | "partial"
  | "reserved"
  | "consumed"
  | "released";

export interface StoreOrderInventoryState {
  reservationStatus: StoreOrderReservationStatus;
  reservedQuantity: number;
  shortageQuantity: number;
  productionRequired: number;
  producedQuantity?: number;
  consumedQuantity: number;
  releasedQuantity: number;
  productionStatus?: "pending" | "completed" | "not_required";
}

export interface StoreOrderOption {
  id?: string;
  productId?: string;
  name: string;
  price?: number;
  quantity?: number;
  imageUrl?: string;
}

export interface StoreOrderItem {
  id?: string;
  productId?: string;
  sku?: string;
  name: string;
  qty: number;
  price?: number;
  subtotal: number;
  category?: string;
  imageUrl?: string;
  note?: string;
  availabilityMode?: "normal" | "made_to_order";
  inventoryTracked?: boolean;
  stockAvailable?: number | null;
  stockReserved?: number;
  stockShortage?: number;
  productionRequired?: number;
  inventoryState?: StoreOrderInventoryState;
  stockState?: "available" | "insufficient" | "not_tracked" | "made_to_order";
  fulfillmentOptions?: {
    pickup: boolean;
    localDelivery: boolean;
    postal: boolean;
  };
  pickupEligible?: boolean;
  localDeliveryEligible?: boolean;
  postalEligible?: boolean;
  shipping?: {
    fulfillment?: {
      pickup: boolean;
      localDelivery: boolean;
      postal: boolean;
    };
    postalEligible: boolean;
    weightGrams: number | null;
  };
  options?: StoreOrderOption[];
}

export interface StoreOrderHistory {
  status: StoreOrderStatus;
  createdAt?: StoreOrderDate;
  updatedBy?: string;
  note?: string;
}

export interface StoreOrder {
  id: string;

  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerPhoto?: string;

  note?: string;

  deliveryMode?: StoreOrderDeliveryMode;
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  deliveryRegionId?: string;
  deliveryRegion?: Record<string, unknown> | null;
  locationLink?: string;
  address?: string;

  paymentMethod?: string;
  paymentStatus?: string;

  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  shippingFee?: number;
  shipping?: StoreOrderShipping;
  fulfillment?: StoreOrderFulfillment;
  currency?: "JPY" | "BRL" | "USD";
  totalAmount: number;

  createdAt?: StoreOrderDate;
  updatedAt?: StoreOrderDate;
  sellerReadAt?: StoreOrderDate;

  sellerUnread?: boolean;
  updatedBy?: string;

  status: StoreOrderStatus;
  inventoryManaged?: boolean;
  inventoryState?: StoreOrderInventoryState;
  items: StoreOrderItem[];
  history: StoreOrderHistory[];
  offersApplied?: AppliedOfferSnapshot[];
}
