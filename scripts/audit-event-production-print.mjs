import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  panel: read("app/seller/events/[eventId]/EventPanelClient.tsx"),
  route: read("app/api/print/event-production/route.ts"),
  jobs: read("app/api/print/jobs/route.ts"),
  receipt: read("print-service/src/receipt.mjs"),
  printApi: read("print-service/src/api.mjs"),
  printPackage: read("print-service/package.json"),
  messages: read("app/lib/i18n.messages.ts"),
  package: read("package.json"),
};

const checks = [
  ["production tab has print action", files.panel.includes("handlePrintProduction")],
  ["production print button is visible", files.panel.includes("eventPanel.production.printAll")],
  ["date selector and print button share aligned controls", files.panel.includes("sm:grid-cols-[minmax(132px,auto)_auto]") && files.panel.includes("box-border h-11 w-full") && files.panel.includes("whitespace-nowrap")],
  ["selected delivery date is sent to backend", files.panel.includes('deliveryDate: filterDate === "todas" ? null : filterDate')],
  ["seller token protects manual print", files.panel.includes("authorization: `Bearer ${token}`")],
  ["manual print API exists", files.route.includes('export async function POST(request: NextRequest)')],
  ["manual print API authorizes active seller", files.route.includes("authorizeSeller(request, sellerId)")],
  ["cancelled orders are excluded", files.route.includes('=== "cancelled"')],
  ["event quantities are aggregated server-side", files.route.includes("buildProductionSummary")],
  ["summary stores total units", files.route.includes("totalUnits: summary.totalUnits")],
  ["manual request is idempotent", files.route.includes("requestId") && files.route.includes("transaction.create")],
  ["only production-capable profiles receive jobs", files.route.includes('profile.copies !== "customer"')],
  ["manual print does not require autoPrint", !files.route.includes("profile.autoPrint")],
  ["jobs use production copy only", files.route.includes('copies: "production"')],
  ["station claim supports production summary jobs", files.jobs.includes('job.type === "event_production_summary"')],
  ["legacy print services do not claim unsupported summary jobs", files.jobs.includes('!stationCapabilities.includes("event-production-summary")')],
  ["production summary QR opens event production panel", files.jobs.includes("?tab=production")],
  ["print service renders production summary", files.receipt.includes('job.type === "event_production_summary"')],
  ["print service advertises production-summary support", files.printApi.includes('"event-production-summary"')],
  ["print service version was bumped", files.printApi.includes('const VERSION = "2.2.0"') && files.printPackage.includes('"version": "2.2.0"')],
  ["printed list includes checkboxes", files.receipt.includes("productionSummaryRows") && files.receipt.includes("checkboxGlyph")],
  ["printed list displays total units", files.receipt.includes('line("Total de unidades"')],
  ["Portuguese print labels exist", files.messages.includes('"eventPanel.production.printAll": "Imprimir produção completa"')],
  ["English print labels exist", files.messages.includes('"eventPanel.production.printAll": "Print full production"')],
  ["Japanese print labels exist", files.messages.includes('"eventPanel.production.printAll": "製造一覧をすべて印刷"')],
  ["audit script is registered", files.package.includes('"audit:event-production-print"')],
];

let failures = 0;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures += 1;
    console.error(`✗ ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} event production print checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} event production print checks passed.`);
