import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(
  root,
  "app/api/public/events/[sellerId]/[eventId]/products/route.ts",
);
const eventClientPath = path.join(root, "app/event/[...id]/EventClient.tsx");
const orderRoutePath = path.join(root, "app/api/orders/create/route.ts");
const rulesPath = path.join(root, "firestore.rules");

const route = fs.readFileSync(routePath, "utf8");
const eventClient = fs.readFileSync(eventClientPath, "utf8");
const orderRoute = fs.readFileSync(orderRoutePath, "utf8");
const rules = fs.readFileSync(rulesPath, "utf8");

const checks = [
  [
    "API exige seller/evento publicamente disponíveis",
    route.includes("sellerProfile.available") &&
      route.includes("onboarding.complete !== true") &&
      route.includes("!eventIsPublic(event)"),
  ],
  [
    "API deriva IDs somente do evento publicado",
    route.includes("event.productIds") &&
      route.includes("event.featuredProductIds") &&
      route.includes("itemDataById.keys()"),
  ],
  [
    "API abre somente status hidden",
    route.includes('raw.status !== "hidden"'),
  ],
  [
    "DTO não expõe campos internos óbvios",
    !/costPrice|purchasePrice|supplier|margin|internalNotes/.test(
      route.slice(route.indexOf("const products =")),
    ),
  ],
  [
    "EventClient combina DTO hidden com catálogo público",
    eventClient.includes("fetchEventHiddenProducts") &&
      eventClient.includes("...hiddenProducts") &&
      eventClient.includes("Object.assign(result, hiddenProducts)"),
  ],
  [
    "Catálogo Firestore público continua sem liberar hidden",
    eventClient.includes('where("status", "in", ["active", "made_to_order"])') &&
      rules.includes('resource.data.status in [\n              "active",\n              "made_to_order"'),
  ],
  [
    "Produtos hidden do evento recebem atualização periódica segura",
    eventClient.includes("hiddenRefreshInterval") &&
      eventClient.includes('document.visibilityState === "visible"'),
  ],
  [
    "Backend bloqueia hidden na Store mas permite contexto Event",
    orderRoute.includes('source === "store" && catalogStatus === "hidden"'),
  ],
];

let failures = 0;
for (const [label, ok] of checks) {
  if (ok) {
    console.log(`✅ ${label}`);
  } else {
    failures += 1;
    console.error(`❌ ${label}`);
  }
}

console.log(`\nHidden Event Products: ${checks.length - failures}/${checks.length}`);
if (failures > 0) process.exit(1);
