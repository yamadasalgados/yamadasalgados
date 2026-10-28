const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = p => fs.readFileSync(p, "utf8");
const store = read("app/store/[sellerId]/StoreClient.tsx");
const wishlist = read("app/api/customer/wishlist/route.ts");
const demand = read("app/api/seller/wishlist-demand/route.ts");
const hook = read("app/hooks/useCustomerWishlist.ts");
const notices = read("functions/src/notifications.ts");
const index = read("functions/src/index.ts");
const tests = [
  ["Vitrine só exibe destaques selecionados", store.includes("featuredProducts.length > 0")],
  ["Rolagem automática e pausa manual", store.includes("setInterval") && store.includes("setAutoPaused")],
  ["Respeita redução de movimento", store.includes("prefers-reduced-motion: reduce")],
  ["Favoritos na vitrine", store.includes("WishlistHeart") && store.includes("WishlistShelf")],
  ["Wishlist autenticada", wishlist.includes("verifyIdToken") && wishlist.includes("customers")],
  ["Sem roles comerciais em wishlist", wishlist.includes('role === "seller"') && wishlist.includes('role === "admin"')],
  ["Writes backend na mesma transação", wishlist.includes("runTransaction") && wishlist.includes("tx.set(sourceRef") && wishlist.includes("tx.set(mirrorRef")],
  ["Lista limitada por usuário", wishlist.includes("40 favoritos")],
  ["Permissão separada dos favoritos", hook.includes("notifyWhenAvailable") && notices.includes("notifyWhenAvailable")],
  ["Seller vê demanda agregada", demand.includes("waiting") && demand.includes("optedIn") && !demand.includes("customer.email")],
  ["Avisa somente após voltar ao estoque", notices.includes("isWishlistProductAvailable(before)") && notices.includes("!isWishlistProductAvailable(after)")],
  ["Deduplificação de notificações", notices.includes('collection("wishlistAlerts")') && notices.includes('collection("receipts")')],
  ["Function exportada", index.includes("notifyWishlistRestock")],
];
let passed=0;
for (const [name, ok] of tests) {if(ok) {console.log(`✓ ${name}`);passed++;} else console.error(`✗ ${name}`)}
assert.equal(passed,tests.length,"Auditoria incompleta");
console.log(`${passed}/${tests.length} verificações estruturais concluídas.`);
