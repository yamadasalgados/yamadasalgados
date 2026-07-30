import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  store: path.join(root, "app/store/[sellerId]/StoreClient.tsx"),
  navigation: path.join(root, "app/_components/RoleNavigation.tsx"),
  cartNavigation: path.join(root, "app/lib/cart-navigation.ts"),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) {
    throw new Error(`[audit:store-cart-experience] Missing ${name}: ${file}`);
  }
}

const store = fs.readFileSync(files.store, "utf8");
const navigation = fs.readFileSync(files.navigation, "utf8");
const cartNavigation = fs.readFileSync(files.cartNavigation, "utf8");

const checks = [
  ["last-chance cards support direct cart addition", store.includes("Adicionar ao carrinho") && store.includes("last-chance-${product.id}")],
  ["last-chance cards support inline quantity changes", store.includes("setQuantity(product, qty - 1)") && store.includes("setQuantity(product, qty + 1)")],
  ["last-chance configurable bundles open the configurator", store.includes("setConfiguringBundle(product)")],
  ["offer progress is attached to eligible product cards", store.includes("function OfferProgressBadge") && store.includes("productId={product.id}")],
  ["eligible offer cards receive pending and active visual states", store.includes("border-emerald-400") && store.includes("border-orange-500")],
  ["offer completion panel lists eligible products", store.includes("function OfferCompletionPanel") && store.includes("offer-completion-${product.id}")],
  ["offer quantities can be adjusted in the final summary", store.includes("function OrderSummary") && store.includes("onChangeQuantity(item, item.qty + 1)")],
  ["offer completion panel is present in the final summary", store.includes("<OfferCompletionPanel") && store.includes("function OrderSummary")],
  ["cart drawer separates cart and order views", store.includes('useState<"cart" | "orders">("cart")') && store.includes("CustomerOrdersPreview")],
  ["cart drawer shows an item-count badge", store.includes("totalItems > 99 ? \"99+\" : totalItems")],
  ["registered customers can load order status and history", store.includes("loadCustomerOrders") && store.includes("Histórico de compras")],
  ["guest customers receive a sign-in path that reopens the cart", store.includes("?openCart=1") && store.includes("Entre para ver seus pedidos")],
  ["customer order dates are protected against invalid timestamps", store.includes("function formatCustomerOrderDate") && store.includes('if (timestamp <= 0) return "—"')],
  ["store toolbar keeps back and cart controls visible", store.includes("handleStoreToolbarBack") && store.includes("sticky top-16") && store.includes("setCartOpen(true)")],
  ["store toolbar cart control has a badge", store.includes("ring-neutral-50") && store.includes("totalItems > 0")],
  ["public navigation renames orders to cart on permanent stores", navigation.includes("const secondItem: NavItem = permanentStorePage") && navigation.includes("label: copy.cart")],
  ["public navigation cart item exposes a badge", navigation.includes("badge: cartCount")],
  ["same-page cart opening uses a custom event", navigation.includes("requestPublicCartOpen(sellerId)") && store.includes("PUBLIC_CART_OPEN_EVENT")],
  ["cross-page cart opening uses the openCart query", navigation.includes("openCart=1") && store.includes('url.searchParams.get("openCart") === "1"')],
  ["cart summary storage is isolated by seller", cartNavigation.includes("orderapp_public_cart_summary_v1:${sellerId.trim()}")],
  ["cart summary is synchronized through storage and custom events", navigation.includes('window.addEventListener("storage", onStorage)') && cartNavigation.includes("PUBLIC_CART_SUMMARY_EVENT")],
  ["navigation callback prevents unnecessary route changes", navigation.includes("event.preventDefault()") && navigation.includes("item.onActivate()")],
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
  throw new Error(`[audit:store-cart-experience] ${failed} check(s) failed.`);
}

console.log(`[audit:store-cart-experience] ${checks.length} checks passed.`);
