import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const rules = read("firestore.rules");
const storeClient = read("app/store/[sellerId]/StoreClient.tsx");
const eventClient = read("app/event/[...id]/EventClient.tsx");
const packageJson = JSON.parse(read("package.json"));

const failures = [];
const passes = [];

function check(label, condition, detail) {
  if (condition) {
    passes.push(label);
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return "";
  const end = text.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? text.slice(start) : text.slice(start, end);
}

const sellerRootBlock = between(
  rules,
  "match /sellers/{sellerId} {",
  "// =======================================================\n      // PLAN REQUESTS",
);
const productsBlock = between(
  rules,
  "match /products/{productId} {",
  "match /offers/{offerId} {",
);
const offersBlock = between(
  rules,
  "match /offers/{offerId} {",
  "match /settings/{settingId} {",
);
const messagesBlock = between(
  rules,
  "match /messages/{messageId} {",
  "}\n        }\n      }\n    }",
);

check(
  "Firestore mantém default deny",
  /match \/\{document=\*\*\} \{\s*allow read, write: if false;/s.test(rules),
);
check(
  "Documento raiz do seller não é público",
  sellerRootBlock.length > 0 && !/allow read\s*:\s*if true/.test(sellerRootBlock),
);
check(
  "Ownership exige role seller ativa",
  /function isSellerPrincipal\(sellerId\)[\s\S]*currentUserData\(\)\.role == "seller"[\s\S]*currentUserData\(\)\.accountStatus == "active"/.test(rules),
);
check(
  "Operação exige seller ativo, onboarding e acesso vigente",
  /function sellerCanOperate\(sellerId\)[\s\S]*onboarding\.complete == true[\s\S]*accessIsCurrentlyActive/.test(rules),
);
check(
  "Produtos públicos exigem status publicável",
  /resource\.data\.status in \[[\s\S]*"active"[\s\S]*"made_to_order"[\s\S]*\]/.test(productsBlock),
);
check(
  "Ofertas públicas exigem status ativo",
  /resource\.data\.status == "active"/.test(offersBlock),
);
check(
  "Chat de evento não possui leitura/criação pública direta",
  messagesBlock.length > 0 &&
    !/allow\s+read\s*,\s*create\s*:\s*if\s+true/.test(messagesBlock) &&
    !/allow\s+read\s*:\s*if\s+true/.test(messagesBlock) &&
    !/allow\s+create\s*:\s*if\s+true/.test(messagesBlock),
);
check(
  "Dados de customers permanecem backend-only",
  /match \/customers\/\{document=\*\*\} \{\s*allow read, write: if false;/s.test(rules),
);
check(
  "API pública sanitizada do seller existe",
  exists("app/api/public/sellers/[sellerId]/route.ts") &&
    exists("app/lib/public-seller-profile.ts") &&
    exists("app/lib/public-seller-client.ts"),
);
check(
  "API de chat público com token existe",
  exists("app/api/public/event-chat/route.ts") &&
    exists("app/lib/event-chat-client.ts"),
);
check(
  "Token do chat não é enviado na URL",
  /authorization:\s*`Bearer \$\{access\.token\}`/.test(read("app/lib/event-chat-client.ts")) &&
    !/searchParams\.get\("token"\)/.test(read("app/api/public/event-chat/route.ts")),
);
check(
  "Evento não usa addDoc/onSnapshot diretamente no chat público",
  !/collection\([^\n]*["']messages["']/.test(eventClient) &&
    !/addDoc\s*\(/.test(eventClient),
);
check(
  "Vitrine filtra produtos por status",
  /where\([\s\S]*?"status"[\s\S]*?"in"[\s\S]*?\[[\s\S]*?"active"[\s\S]*?"made_to_order"[\s\S]*?\][\s\S]*?\)/.test(storeClient),
);
check(
  "Vitrine filtra ofertas ativas",
  /where\([\s\S]*?"status"[\s\S]*?"=="[\s\S]*?"active"[\s\S]*?\)/.test(storeClient),
);
check(
  "Script está registrado no package.json",
  packageJson?.scripts?.["audit:firestore-security"] ===
    "node scripts/audit-firestore-security.mjs",
);

const weakOwnerPattern = /decoded\.uid\s*===\s*sellerId\s*\|\||userData\.sellerId\s*===\s*sellerId/;
const serverFiles = [];
for (const base of ["app/api", "app/lib"]) {
  const absoluteBase = path.join(root, base);
  if (!fs.existsSync(absoluteBase)) continue;
  const stack = [absoluteBase];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (/\.(ts|tsx)$/.test(entry.name)) serverFiles.push(absolute);
    }
  }
}
const weakOwnerFiles = serverFiles.filter((file) => weakOwnerPattern.test(fs.readFileSync(file, "utf8")));
check(
  "APIs não usam o ownership legado permissivo",
  weakOwnerFiles.length === 0,
  weakOwnerFiles.map((file) => path.relative(root, file)).join(", "),
);
check(
  "Rotas operacionais exigem acesso vigente",
  exists("app/lib/seller-authorization.ts") &&
    /isAdminOrOperationalSellerOwnerRecord/.test(read("app/api/orders/status/route.ts")) &&
    /isAdminOrOperationalSellerOwnerRecord/.test(read("app/api/orders/production/route.ts")) &&
    /isAdminOrOperationalSellerOwnerRecord/.test(read("app/api/seller/rewards/route.ts")) &&
    /isAdminOrOperationalSellerOwnerRecord/.test(read("app/lib/print-server.ts")),
);
check(
  "APIs não tratam conta sem status como ativa",
  /data\.accountStatus === "active"/.test(read("app/lib/seller-authorization.ts")) &&
    /return data\.active === true/.test(read("app/lib/seller-authorization.ts")),
);

console.log(`\nAuditoria Firestore 06E1A: ${passes.length} verificações aprovadas.`);
for (const label of passes) console.log(`  ✓ ${label}`);

if (failures.length) {
  console.error(`\n${failures.length} falha(s) encontrada(s):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nNenhuma regressão crítica conhecida foi encontrada.");
}
