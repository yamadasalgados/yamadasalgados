"use client";

import { auth } from "@/app/lib/firebase";

export type SellerProductionTarget = {
  source: "store" | "event";
  eventId?: string;
  orderId: string;
};

export type RecordSellerProductionInput = {
  sellerId: string;
  productId: string;
  quantity: number;
  requestId: string;
  targets: SellerProductionTarget[];
};

export type RecordSellerProductionResult = {
  ok: true;
  recordedQuantity: number;
  remainingQuantity: number;
  autoReadyOrderIds: string[];
  replayed: boolean;
};

export class SellerProductionError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(params: {
    code: string;
    message: string;
    status?: number | null;
  }) {
    super(params.message);
    this.name = "SellerProductionError";
    this.code = params.code;
    this.status = params.status ?? null;
  }
}

export async function recordSellerProduction(
  input: RecordSellerProductionInput,
): Promise<RecordSellerProductionResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new SellerProductionError({
      code: "AUTH_REQUIRED",
      message: "Entre novamente para registrar a produção.",
      status: 401,
    });
  }

  const idToken = await user.getIdToken();
  let response: Response;

  try {
    response = await fetch("/api/orders/production", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw new SellerProductionError({
      code: "NETWORK_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Falha de conexão ao registrar a produção.",
    });
  }

  const payload = (await response.json().catch(() => null)) as
    | RecordSellerProductionResult
    | { ok?: false; code?: unknown; error?: unknown }
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    throw new SellerProductionError({
      code:
        payload && "code" in payload && typeof payload.code === "string"
          ? payload.code
          : "PRODUCTION_UPDATE_FAILED",
      message:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Não foi possível registrar a produção.",
      status: response.status,
    });
  }

  return payload;
}
