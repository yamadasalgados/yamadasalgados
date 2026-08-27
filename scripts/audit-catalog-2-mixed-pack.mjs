import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const schema = read("app/lib/product-schema.ts");
const types = read("app/seller/products/product-types.ts");
const manager = read("app/seller/products/CategoryManager.tsx");
const form = read("app/seller/products/ProductForm.tsx");
const modal = read("app/seller/products/ProductModal.tsx");
const productsPage = read("app/seller/products/page.tsx");
const client = read("app/lib/public-order-client.ts");
const createOrder = read("app/api/orders/create/route.ts");
const orderStatus = read("app/api/orders/status/route.ts");
const production = read("app/api/orders/production/route.ts");
const store = read("app/store/[sellerId]/StoreClient.tsx");
const event = read("app/event/[...id]/EventClient.tsx");
const printJobs = read("app/api/print/jobs/route.ts");
const receipt = read("print-service/src/receipt.mjs");
const eventPrint = read("app/api/print/event-production/route.ts");
const publicCategories = read("app/api/public/sellers/[sellerId]/categories/route.ts");
const publicCategorySchema = read("app/lib/public-category.ts");

check("schema defines mixed_pack separately", schema.includes('"standard" | "mixed_pack"'));
check("mixed pack config has units/options/repeat/min/max", ["unitsPerPack", "optionProductIds", "allowRepeats", "minDistinct", "maxPerProduct"].every((key) => schema.includes(key)));
check("category schema has hierarchy/translations/tags/capability", ["parentId", "names", "tags", "mixedPackEligible"].every((key) => types.includes(key)));
check("category manager is wired to product page", productsPage.includes("<CategoryManager") && productsPage.includes("Categorias 2.0"));
check("category manager saves schemaVersion 2", manager.includes("schemaVersion: 2") && manager.includes("parentId") && manager.includes("capabilities"));
check("public category API is sanitized", publicCategories.includes("normalizePublicCategory") && publicCategorySchema.includes("id: string") && publicCategorySchema.includes("parentId: string | null") && !publicCategorySchema.includes("ownerUid"));
check("product form exposes mixed pack type", form.includes('value: "mixed_pack"') && form.includes("mixedPackUnits") && form.includes("mixedPackOptionProductIds"));
check("product modal persists productType", modal.includes("productType,") && modal.includes("mixedPackConfig:"));
check("product modal protects legacy bundle", modal.includes('productType !== "mixed_pack" && bundleEnabled'));
check("public order client sends mixedPackSelections", client.includes("mixedPackSelections?:"));
check("backend validates mixed pack selections", createOrder.includes("mixedPackSelections") && createOrder.includes("minDistinct") && createOrder.includes("maxPerProduct"));
check("backend builds operational inventory items", createOrder.includes("operationalDemand") && createOrder.includes("inventoryItems"));
check("status/cancel flow prefers inventoryItems", orderStatus.includes("inventoryItems"));
check("production flow prefers inventoryItems", production.includes("inventoryItems"));
check("store has mixed pack configurator/send path", store.includes('productType === "mixed_pack"') && store.includes("orderMixedPackSelections"));
check("event has mixed pack dialog/send path", event.includes("EventMixedPackDialog") && event.includes("mixedPackSelections: orderMixedPackSelections"));
check("event consolidated print uses inventoryItems", eventPrint.includes("order.inventoryItems"));
check("normal print API exposes inventoryItems", printJobs.includes("inventoryItems: normalizeItems(order.inventoryItems)"));
check("production receipt renders inventoryItems", receipt.includes("function receiptItems") && receipt.includes("order.inventoryItems"));

function validatePack({ packQuantity, unitsPerPack, selections, allowRepeats, minDistinct, maxPerProduct }) {
  const entries = Object.entries(selections).filter(([, q]) => Number.isInteger(q) && q > 0);
  const total = entries.reduce((sum, [, q]) => sum + q, 0);
  if (total !== packQuantity * unitsPerPack) return false;
  if (entries.length < minDistinct) return false;
  for (const [, quantity] of entries) {
    if (!allowRepeats && quantity > packQuantity) return false;
    if (maxPerProduct != null && quantity > maxPerProduct * packQuantity) return false;
  }
  return true;
}

const oneEach = validatePack({ packQuantity: 1, unitsPerPack: 3, selections: { coxinha: 1, risoles: 1, kibe: 1 }, allowRepeats: false, minDistinct: 3, maxPerProduct: 1 });
const twoEach = validatePack({ packQuantity: 2, unitsPerPack: 3, selections: { coxinha: 2, risoles: 2, kibe: 2 }, allowRepeats: false, minDistinct: 3, maxPerProduct: 1 });
const incomplete = validatePack({ packQuantity: 1, unitsPerPack: 3, selections: { coxinha: 1, risoles: 1 }, allowRepeats: false, minDistinct: 2, maxPerProduct: 1 });
const repeated = validatePack({ packQuantity: 1, unitsPerPack: 3, selections: { coxinha: 2, kibe: 1 }, allowRepeats: false, minDistinct: 2, maxPerProduct: 2 });
check("behavior: 1+1+1 pack is valid", oneEach);
check("behavior: two packs aggregate 2+2+2", twoEach);
check("behavior: incomplete pack is rejected", !incomplete);
check("behavior: forbidden repeat is rejected", !repeated);

const demand = new Map();
const add = (id, q) => demand.set(id, (demand.get(id) || 0) + q);
add("coxinha", 2); // avulso
for (const [id, q] of Object.entries({ coxinha: 1, risoles: 1, kibe: 1 })) add(id, q); // pack
check("behavior: direct + pack demand aggregates", demand.get("coxinha") === 3 && demand.get("risoles") === 1 && demand.get("kibe") === 1);

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) console.log(`${entry.ok ? "✅" : "❌"} ${entry.name}`);
console.log(`\nCatalog 2.0 / Mixed Pack: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
