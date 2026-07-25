import { auth } from "@/app/lib/firebase";

export type CustomerOrderStatus = "pending" | "ready" | "delivered" | "cancelled";
export type CustomerOrderSource = "store" | "event";
export type CustomerOrderCurrency = "JPY" | "BRL" | "USD";

export type CustomerOrderSummary = {
  referenceId: string;
  orderId: string;
  sellerId: string;
  eventId: string;
  source: CustomerOrderSource;
  status: CustomerOrderStatus;
  storeName: string;
  eventTitle: string;
  currency: CustomerOrderCurrency;
  totalAmountMinor: number;
  totalItems: number;
  deliveryMode: string;
  deliveryDate: string;
  deliveryTimeSlot: string;
  readinessReasonCodes: string[];
  pointsRedeemed: number;
  pointsToEarn: number;
  rewardMode: string;
  rewardStatus: string;
  createdAt: string;
  updatedAt: string;
  storeHref: string;
  eventHref: string;
};

export type CustomerOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  imageUrl: string;
  category: string;
  productionRequired: number;
  producedQuantity: number;
  options: Array<{
    productId: string;
    name: string;
    imageUrl: string;
    quantity: number;
  }>;
};

export type CustomerOrderHistoryEntry = {
  status: CustomerOrderStatus;
  createdAt: string;
  note: string;
};

export type CustomerOrderDetail = CustomerOrderSummary & {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  subtotalMinor: number;
  discountMinor: number;
  offerDiscountMinor: number;
  rewardsDiscountMinor: number;
  pointsRedeemed: number;
  pointsToEarn: number;
  rewardMode: string;
  rewardStatus: string;
  rewardRedemptionStatus: string;
  rewardProductName: string;
  shippingFeeMinor: number;
  address: string;
  locationLink: string;
  note: string;
  items: CustomerOrderItem[];
  history: CustomerOrderHistoryEntry[];
};

type ApiFailure = { ok?: false; error?: unknown };

async function authorizedFetch(url: string): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");

  const token = await user.getIdToken();
  return fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

export async function loadCustomerOrders(): Promise<CustomerOrderSummary[]> {
  const response = await authorizedFetch("/api/customer/orders");
  const payload = (await response.json().catch(() => null)) as
    | { ok?: true; orders?: unknown }
    | ApiFailure
    | null;

  if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.orders)) {
    throw new Error(
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Não foi possível carregar seus pedidos.",
    );
  }

  return payload.orders as CustomerOrderSummary[];
}

export async function loadCustomerOrder(referenceId: string): Promise<CustomerOrderDetail> {
  const response = await authorizedFetch(
    `/api/customer/orders/${encodeURIComponent(referenceId)}`,
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok?: true; order?: unknown }
    | ApiFailure
    | null;

  if (!response.ok || !payload || payload.ok !== true || !payload.order) {
    throw new Error(
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Não foi possível carregar o pedido.",
    );
  }

  return payload.order as CustomerOrderDetail;
}
