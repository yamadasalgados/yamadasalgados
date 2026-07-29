#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const failures = [];
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function loadScheduledPriceModule() {
  const ts = require("typescript");
  let source = read("app/lib/scheduled-price.ts");

  source = source
    .replace(
      'import { majorToMinor } from "@/app/lib/money";',
      `const majorToMinor = (value, currency) => currency === "JPY" ? Math.round(value) : Math.round(value * 100);`,
    )
    .replace(
      'import type { SupportedCurrency } from "@/app/types/regional";',
      "type SupportedCurrency = \"JPY\" | \"BRL\" | \"USD\";",
    );

  const transpiled = ts.transpileModule(source, {
    fileName: "scheduled-price.ts",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });

  const errors = (transpiled.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n"),
    );
  }

  const module = { exports: {} };
  vm.runInNewContext(transpiled.outputText, {
    module,
    exports: module.exports,
    require,
    console,
    Date,
    Intl,
    Math,
    Number,
    String,
    Object,
    Array,
    RegExp,
  });
  return module.exports;
}

const scheduled = loadScheduledPriceModule();
const now = Date.UTC(2026, 6, 30, 0, 0, 0);
const at = now + 7 * 86_400_000;

const recovered = scheduled.resolveProductScheduledPriceChange(
  {
    scheduledPriceChange: {
      enabled: true,
      nextPriceMinor: 600,
      startsAt: {},
      showCountdown: true,
    },
    scheduledPriceStartsAtMillis: at,
    scheduledPriceNoticeDays: 7,
  },
  "JPY",
);
assert(recovered.enabled === true, "The enabled flag was not recovered.");
assert(recovered.startsAtMillis === at, "A valid millisecond fallback did not survive a malformed Timestamp object.");
assert(recovered.nextPriceMinor === 600, "The next price was not normalized.");
assert(recovered.noticeStartsBeforeDays === 7, "The default warning window is not seven days.");
assert(recovered.countdownStartsBeforeMinutes === 1440, "The countdown does not start in the final 24 hours.");
assert(recovered.showInLastChance === true, "Last Chance should be enabled by default.");

const serializedTimestamp = scheduled.timestampToMillis({
  _seconds: Math.floor(at / 1000),
  _nanoseconds: 0,
});
assert(serializedTimestamp === at, "Serialized Firestore Timestamp was not parsed.");

const tokyoLocal = "2026-08-10T00:00";
const tokyoMillis = scheduled.dateTimeLocalToUtcMillis(tokyoLocal, "Asia/Tokyo");
assert(tokyoMillis === Date.UTC(2026, 7, 9, 15, 0, 0), "Tokyo local date/time was not converted to UTC correctly.");
assert(
  scheduled.utcMillisToDateTimeLocal(tokyoMillis, "Asia/Tokyo") === tokyoLocal,
  "The Tokyo date/time did not survive the edit form round trip.",
);
const saoPauloLocal = "2026-08-10T12:30";
const saoPauloMillis = scheduled.dateTimeLocalToUtcMillis(saoPauloLocal, "America/Sao_Paulo");
assert(
  scheduled.utcMillisToDateTimeLocal(saoPauloMillis, "America/Sao_Paulo") === saoPauloLocal,
  "The São Paulo date/time did not survive the edit form round trip.",
);

const common = {
  basePriceMinor: 500,
  scheduledPriceChange: {
    enabled: true,
    nextPriceMinor: 600,
    startsAtMillis: at,
    showCountdown: true,
    noticeStartsBeforeDays: 7,
    countdownStartsBeforeMinutes: 1440,
    showInLastChance: true,
    appliedNoticeDurationDays: 3,
  },
  currency: "JPY",
};

assert(
  scheduled.evaluateProductPrice({ ...common, now: at - 8 * 86_400_000 }).noticePhase === "hidden",
  "The public warning appears earlier than configured.",
);
assert(
  scheduled.evaluateProductPrice({ ...common, now: at - 6 * 86_400_000 }).noticePhase === "notice",
  "The seven-day warning window did not open.",
);
assert(
  scheduled.evaluateProductPrice({ ...common, now: at - 2 * 86_400_000 }).noticePhase === "urgent",
  "The three-day urgency phase did not activate.",
);
const finalDay = scheduled.evaluateProductPrice({ ...common, now: at - 23 * 60 * 60_000 });
assert(finalDay.noticePhase === "countdown", "The final 24-hour countdown did not activate.");
assert(finalDay.shouldShowCountdown === true, "The countdown visibility flag is false in the final 24 hours.");
assert(finalDay.shouldShowInLastChance === true, "The product did not enter Last Chance during its warning window.");
assert(
  scheduled.evaluateProductPrice({ ...common, now: at - 30 * 60_000 }).noticePhase === "last_hour",
  "The final-hour phase did not activate.",
);
const active = scheduled.evaluateProductPrice({ ...common, now: at + 60_000 });
assert(active.status === "active", "The scheduled price did not become active.");
assert(active.effectivePriceMinor === 600, "The new price was not applied automatically.");
assert(active.noticePhase === "active_recent", "The post-change notice did not activate.");

const productModal = read("app/seller/products/ProductModal.tsx");
assert(productModal.includes("scheduledPriceStartsAtMillis"), "ProductModal does not save the redundant millisecond timestamp.");
assert(productModal.includes("await getDoc(persistedReference"), "ProductModal does not verify the saved Firestore document.");
assert(productModal.includes('throw new Error("SCHEDULE_NOT_PERSISTED")'), "ProductModal does not detect failed schedule persistence.");
assert(productModal.includes("scheduledPriceNoticeDays"), "ProductModal does not persist the configurable warning window.");
assert(productModal.includes("scheduledPriceShowInLastChance"), "ProductModal does not persist Last Chance visibility.");

const productForm = read("app/seller/products/ProductForm.tsx");
for (const days of ["1", "3", "7", "15", "30"]) {
  assert(productForm.includes(`<option value="${days}">`), `The ${days}-day warning preset is missing.`);
}
assert(productForm.includes('value="custom"'), "The custom warning window option is missing.");

const sellerPage = read("app/seller/products/page.tsx");
const storePage = read("app/store/[sellerId]/StoreClient.tsx");
const eventPage = read("app/event/[...id]/EventClient.tsx");
assert(sellerPage.includes("setPricingNow(now)"), "Seller cards do not refresh their countdown clock.");
assert(storePage.includes("setPricingNow(now)"), "Store cards do not refresh their countdown clock.");
assert(eventPage.includes("setPricingNow(now)"), "Event cards do not refresh their countdown clock.");
assert(storePage.includes("lastChanceProducts"), "The automatic Last Chance showcase is missing.");
assert(storePage.includes("scheduledPresentation.badgeClassName"), "Store warning colors are not phase-aware.");
assert(eventPage.includes("scheduledPresentation.badgeClassName"), "Event warning colors are not phase-aware.");

if (failures.length > 0) {
  console.error(`Scheduled-price audit failed (${failures.length}/${checks}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Scheduled-price audit passed: ${checks} checks.`);
