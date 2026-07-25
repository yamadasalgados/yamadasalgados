"use client";

import { auth } from "@/app/lib/firebase";

export type ProductionReportMovement = {
  id: string;
  productId: string;
  productName: string;
  orderId: string;
  orderSource: "store" | "event";
  eventId: string;
  eventTitle: string;
  quantity: number;
  orderBecameReady: boolean;
  requestId: string;
  createdAt: string;
  createdAtMillis: number;
  createdBy: string;
  createdByUid: string;
  customerName: string;
  deliveryDate: string;
  issueCodes: string[];
};

export type ProductionProductSummary = {
  productId: string;
  productName: string;
  quantity: number;
  movements: number;
  orders: number;
  readyOrders: number;
};

export type ProductionActorSummary = {
  actor: string;
  actorUid: string;
  quantity: number;
  movements: number;
  orders: number;
  lastAt: string;
};

export type ProductionDaySummary = {
  date: string;
  quantity: number;
  movements: number;
  orders: number;
};

export type ProductionReportResult = {
  ok: true;
  range: { startAt: string; endAt: string };
  summary: {
    totalQuantity: number;
    totalMovements: number;
    uniqueProducts: number;
    uniqueOrders: number;
    readyOrders: number;
    uniqueActors: number;
    issueCount: number;
  };
  products: ProductionProductSummary[];
  actors: ProductionActorSummary[];
  days: ProductionDaySummary[];
  movements: ProductionReportMovement[];
  truncated: boolean;
  maxMovements: number;
};

export class ProductionReportError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(params: { code: string; message: string; status?: number | null }) {
    super(params.message);
    this.name = "ProductionReportError";
    this.code = params.code;
    this.status = params.status ?? null;
  }
}

export async function loadProductionReport(input: {
  sellerId: string;
  startAt: string;
  endAt: string;
  lang: "pt" | "en" | "ja";
  timeZone: string;
}): Promise<ProductionReportResult> {
  const user = auth.currentUser;
  if (!user) {
    throw new ProductionReportError({
      code: "AUTH_REQUIRED",
      message: "Entre novamente para abrir o relatório.",
      status: 401,
    });
  }

  const token = await user.getIdToken();
  const params = new URLSearchParams({
    sellerId: input.sellerId,
    startAt: input.startAt,
    endAt: input.endAt,
    lang: input.lang,
    timeZone: input.timeZone,
  });
  let response: Response;

  try {
    response = await fetch(`/api/orders/production/report?${params.toString()}`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (error) {
    throw new ProductionReportError({
      code: "NETWORK_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Falha de conexão ao carregar o relatório.",
    });
  }

  const payload = (await response.json().catch(() => null)) as
    | ProductionReportResult
    | { ok?: false; code?: unknown; error?: unknown }
    | null;

  if (!response.ok || !payload || payload.ok !== true) {
    throw new ProductionReportError({
      code:
        payload && "code" in payload && typeof payload.code === "string"
          ? payload.code
          : "REPORT_LOAD_FAILED",
      message:
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Não foi possível carregar o relatório de produção.",
      status: response.status,
    });
  }

  return payload;
}
