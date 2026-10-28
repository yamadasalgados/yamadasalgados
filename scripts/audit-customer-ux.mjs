import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const store = read('app/store/[sellerId]/StoreClient.tsx');
const event = read('app/event/[...id]/EventClient.tsx');
const nav = read('app/_components/RoleNavigation.tsx');
const app = read('app/layout.tsx');
const pwa = read('app/_components/GlobalPwaInstallCoach.tsx');

const checks = [
  ['Loja abre diretamente na escolha de categorias, sem produtos arbitrários', store.includes('className="mt-4"') && store.includes('categorySummaries.map((categoryItem)') && !store.includes('products={quickPickProducts}')],
  ['Loja permite ver todos os produtos', store.includes('setShowAllProducts(true)') && store.includes('selectedCategory || fulfillmentFilter || showAllProducts')],
  ['Filtro por entrega fica opcional', store.includes('<summary className="cursor-pointer text-sm font-bold text-neutral-700 dark:text-neutral-200">{text.filterByReceiving}</summary>')],
  ['Promoções podem ser expandidas a pedido', store.includes('lastChanceProducts.length > 0') && store.includes('<details className="mt-5 rounded-2xl border border-amber-200')],
  ['Checkout tem indicação de 3 etapas', store.includes('text.stepNumber.replace("{current}"') && store.includes('[text.productsStep, text.customerStep, text.deliveryStep]')],
  ['Texto da ação é explícito', store.includes('text.cartAction') && store.includes('text.customerNext') && store.includes('text.cartNext')],
  ['Campos obrigatórios têm autocomplete', store.includes('autoComplete="name"') && store.includes('autoComplete="tel"')],
  ['Quantidade na loja usa botões maiores', store.includes('className="flex h-12 w-12') && store.includes('aria-label="Aumentar quantidade')],
  ['Evento tem botão Adicionar legível', event.includes('"Adicionar") : "+"') && event.includes('min-w-12')],
  ['Evento coleta nome e telefone identificados', event.includes('autoComplete="name"') && event.includes('autoComplete="tel"')],
  ['Evento mantém barra de revisão e modal', event.includes('checkoutOpen') && event.includes('"Revisar meu pedido"') && event.includes('role="dialog"')],
  ['Loja e evento dispensam convite PWA durante compra', pwa.includes('pathname.startsWith("/store/")') && pwa.includes('pathname.startsWith("/event/")')],
  ['Visualização permite zoom para acessibilidade', !app.includes('userScalable: false') && !app.includes('maximumScale: 1')],
  ['Navegação de cliente preserva carrinho e pedidos', nav.includes('const secondItem: NavItem = permanentStorePage') && nav.includes('copy.orders')],
  ['Três idiomas possuem textos de compra simples', ['Escolha seus produtos','Choose your products','商品を選ぶ'].every((value) => store.includes(value))],
];
let failures = 0;
for (const [label, success] of checks) {
  console.log(`${success ? '✓' : '✗'} ${label}`);
  if (!success) failures++;
}
if (failures) { console.error(`${failures} problemas na auditoria UX.`); process.exit(1); }
console.log(`${checks.length}/${checks.length} verificações de UX aprovadas.`);
