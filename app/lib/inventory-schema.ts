export type ProductInventory = {
  tracked: boolean;
  quantity: number;
  reserved: number;
  lowStockThreshold: number;
};

export type InventorySnapshot = ProductInventory & {
  available: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.floor(parsed))
    : fallback;
}

/**
 * Normaliza o estoque V2 preservando compatibilidade com os campos legados.
 *
 * `quantity` representa o estoque físico.
 * `reserved` representa unidades separadas para pedidos ainda não entregues.
 * `available` é calculado, nunca persistido como fonte de verdade.
 */
export function normalizeProductInventory(
  rawValue: unknown,
  legacyStock?: unknown,
  legacyThreshold?: unknown,
): InventorySnapshot {
  const raw = record(rawValue);
  const tracked = typeof raw.tracked === "boolean" ? raw.tracked : true;
  const quantity = nonNegativeInteger(
    typeof raw.quantity === "number" ? raw.quantity : legacyStock,
    0,
  );
  const reserved = nonNegativeInteger(raw.reserved, 0);
  const lowStockThreshold = nonNegativeInteger(
    typeof raw.lowStockThreshold === "number"
      ? raw.lowStockThreshold
      : legacyThreshold,
    5,
  );

  return {
    tracked,
    quantity,
    reserved,
    lowStockThreshold,
    available: tracked ? Math.max(0, quantity - reserved) : quantity,
  };
}

export function inventoryAvailable(
  inventory: Pick<ProductInventory, "tracked" | "quantity" | "reserved">,
): number {
  return inventory.tracked
    ? Math.max(0, inventory.quantity - inventory.reserved)
    : Math.max(0, inventory.quantity);
}

export function inventoryStateSnapshot(
  inventory: ProductInventory,
): InventorySnapshot {
  return {
    ...inventory,
    available: inventoryAvailable(inventory),
  };
}
