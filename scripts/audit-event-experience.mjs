import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  event: path.join(root, "app/event/[...id]/EventClient.tsx"),
  panel: path.join(root, "app/seller/events/[eventId]/EventPanelClient.tsx"),
  orderApi: path.join(root, "app/api/orders/create/route.ts"),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    throw new Error(`[audit:event-experience] Missing ${name}: ${file}`);
  }
}

const event = fs.readFileSync(files.event, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const orderApi = fs.readFileSync(files.orderApi, "utf8");

const checks = [
  ["event listens to Firestore changes", event.includes("onSnapshot(")],
  ["event listens to current seller catalog", event.includes("Catalog listener stopped")],
  ["event preserves configured product order", event.includes("A ordem salva em productIds")],
  ["event supports scheduled-price card visibility", event.includes("showScheduledPriceCards")],
  ["event supports offer-card visibility", event.includes("showOfferCards")],
  ["event checkout opens in modal", event.includes('role="dialog"') && event.includes("checkoutOpen")],
  ["event has compact cart review CTA", event.includes("Revisar e finalizar pedido")],
  ["seller can reorder event products", panel.includes("moveEventProduct")],
  ["seller persists event presentation settings", panel.includes("presentationSettings:")],
  ["server uses live catalog commercial data for events", orderApi.includes("const commercialRaw")],
  ["server keeps event availability decision", orderApi.includes("const explicitAvailabilityMode")],
  ["server blocks hidden event offers", orderApi.includes("As ofertas estão ocultas neste evento.")],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

if (failed > 0) {
  throw new Error(`[audit:event-experience] ${failed} check(s) failed.`);
}

console.log(`[audit:event-experience] ${checks.length} checks passed.`);
