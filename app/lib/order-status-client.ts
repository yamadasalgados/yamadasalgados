"use client";

import { auth } from "@/app/lib/firebase";

export type SellerOrderSource = "store" | "event";
export type SellerOrderStatus = "pending" | "ready" | "delivered" | "cancelled";

export type UpdateSellerOrderStatusInput = {
  source: SellerOrderSource;
  sellerId: string;
  eventId?: string;
  orderId: string;
  status: SellerOrderStatus;
  note?: string;
};

export type UpdateSellerOrderStatusResult = {
  ok: true;
  status: SellerOrderStatus;
  replayed: boolean;
  inventoryState?: Record<string, unknown>;
  shortages?: Array<{ productId: string; quantity: number }>;
};

export class SellerOrderStatusError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly shortages: Array<{ productId: string; quantity: number }>;

  constructor(params: {
    code: string;
    message: string;
    status?: number | null;
    shortages?: Array<{ productId: string; quantity: number }>;
  }) {
    super(params.message);
    this.name = "SellerOrderStatusError";
    this.code = params.code;
    this.status = params.status ?? null;
    this.shortages = params.shortages ?? [];
  }
}

export async function updateSellerOrderStatus(
  input: UpdateSellerOrderStatusInput,
): Promise<UpdateSellerOrderStatusResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new SellerOrderStatusError({
      code: "AUTH_REQUIRED",
      message: "Entre novamente para alterar o pedido.",
      status: 401,
    });
  }

  const idToken = await user.getIdToken();
  let response: Response;

  try {
    response = await fetch("/api/orders/status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new SellerOrderStatusError({
      code: "NETWORK_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Falha de conexão ao alterar o pedido.",
    });
  }

  const payload = (await response.json().catch(() => null)) as
    | UpdateSellerOrderStatusResult
    | {
        ok?: false;
        code?: unknown;
        error?: unknown;
        shortages?: unknown;
      }
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    const rawShortages =
      payload && "shortages" in payload && Array.isArray(payload.shortages)
        ? payload.shortages
        : [];
    const shortages = rawShortages
      .map((value) => {
        if (!value || typeof value !== "object") return null;
        const raw = value as Record<string, unknown>;
        const productId = typeof raw.productId === "string" ? raw.productId : "";
        const quantity = Number(raw.quantity);
        return productId && Number.isFinite(quantity)
          ? { productId, quantity: Math.max(0, Math.floor(quantity)) }
          : null;
      })
      .filter(
        (value): value is { productId: string; quantity: number } =>
          value !== null,
      );

    throw new SellerOrderStatusError({
      code:
        payload && "code" in payload && typeof payload.code === "string"
          ? payload.code
          : "STATUS_UPDATE_FAILED",
      message:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Não foi possível alterar o status do pedido.",
      status: response.status,
      shortages,
    });
  }

  return payload;
}
