import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredRoutes = [
  "app/seller/settings/page.tsx",
  "app/seller/settings/identity/page.tsx",
  "app/seller/settings/regional/page.tsx",
  "app/seller/settings/orders/page.tsx",
  "app/seller/settings/fulfillment/page.tsx",
  "app/seller/settings/notifications/page.tsx",
  "app/seller/settings/printing/page.tsx",
  "app/seller/settings/account/page.tsx",
];

const operationalRoutes = [
  "app/seller/store-orders/page.tsx",
  "app/seller/events/page.tsx",
  "app/seller/production/page.tsx",
  "app/seller/products/page.tsx",
  "app/seller/offers/page.tsx",
  "app/seller/rewards/page.tsx",
  "app/seller/reports/page.tsx",
  "app/seller/onboarding/page.tsx",
  "app/seller/rent/page.tsx",
];

const failures = [];

for (const relativePath of [...requiredRoutes, ...operationalRoutes]) {
  if (!existsSync(join(root, relativePath))) {
    failures.push(`Arquivo ausente: ${relativePath}`);
  }
}

const hubPath = join(root, "app/seller/settings/page.tsx");
const hub = existsSync(hubPath) ? readFileSync(hubPath, "utf8") : "";
for (const route of requiredRoutes.slice(1)) {
  const href = `/${route.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`;
  if (!hub.includes(`href: "${href}"`)) {
    failures.push(`Categoria sem acesso no hub: ${href}`);
  }
}

const shortcutHrefs = [
  "/seller/store-orders",
  "/seller/events",
  "/seller/production",
  "/seller/products",
  "/seller/offers",
  "/seller/rewards",
  "/seller/reports",
  "/seller/onboarding",
  "/seller/rent",
];
for (const href of shortcutHrefs) {
  if (!hub.includes(`href: "${href}"`)) {
    failures.push(`Atalho operacional ausente: ${href}`);
  }
}

const identityPath = join(
  root,
  "app/seller/settings/SellerIdentitySettingsCard.tsx",
);
const identity = existsSync(identityPath)
  ? readFileSync(identityPath, "utf8")
  : "";
if (/\bInstagram\s*,/.test(identity)) {
  failures.push("Import incompatível do ícone Instagram ainda presente.");
}

const eventPath = join(root, "app/event/[...id]/EventClient.tsx");
const eventClient = existsSync(eventPath)
  ? readFileSync(eventPath, "utf8")
  : "";
if (!eventClient.includes("const eventCurrency: SupportedCurrency")) {
  failures.push("Normalização tipada de moeda do evento não encontrada.");
}
if (!eventClient.includes("const eventLocale: RegionalLocale")) {
  failures.push("Normalização tipada de locale do evento não encontrada.");
}

if (failures.length > 0) {
  console.error("Auditoria de configurações do seller falhou:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Auditoria de configurações do seller concluída com sucesso.");
console.log(`Rotas de configuração verificadas: ${requiredRoutes.length}`);
console.log(`Áreas operacionais verificadas: ${operationalRoutes.length}`);
