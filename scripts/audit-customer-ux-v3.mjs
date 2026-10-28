import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const store = readFileSync('app/store/[sellerId]/StoreClient.tsx', 'utf8');
const navigation = readFileSync('app/_components/RoleNavigation.tsx', 'utf8');
const checks = [
  ['Identidade é exibida apenas no cabeçalho da navegação', !store.includes('StoreIdentityHero') && navigation.includes('function Brand(')],
  ['Cabeçalho secundário "Categorias" foi removido', !store.includes('sticky top-16')],
  ['Página começa com "Escolha seus produtos"', store.includes('<h1 className="text-2xl font-black sm:text-3xl">{text.quickTitle}</h1>')],
  ['Categorias são as primeiras opções na vitrine', store.indexOf('categorySummaries.map((categoryItem)') < store.indexOf('{lastChanceProducts.length > 0 && (')],
  ['Produtos arbitrários não são apresentados na abertura', !store.includes('quickPickProducts')],
  ['O usuário pode abrir busca imediatamente', store.includes('aria-label={text.openSearch}') && store.includes('type="search"')],
  ['Busca continua filtrando produto e categoria', store.includes('setSearch(event.target.value)') && store.includes('setSelectedCategory(null)')],
  ['Cartões de categoria continuam acessíveis', store.includes('setSelectedCategory(categoryItem.name)')],
  ['Botão de voltar às categorias continua disponível', store.includes('onClick={handleStoreToolbarBack}') && store.includes('text.backToCategories')],
  ['Opção "Ver todos" continua disponível', store.includes('setShowAllProducts(true)') && store.includes('{text.browseAll}')],
  ['Itens sob encomenda continuam disponíveis na página inicial', store.includes('products={madeToOrderProducts}')],
  ['Categoria mostra também seus itens sob encomenda', store.includes('visibleMadeToOrderProducts.length > 0 && (')],
  ['Ofertas e avisos de última chance não foram removidos', store.includes('lastChanceProducts.length > 0') && store.includes('offerEvaluation={selectedOfferEvaluation}')],
  ['Recebimento opcional continua no catálogo', store.includes('fulfillmentVitrines.length > 0') && store.includes('text.filterByReceiving')],
  ['Checkout e carrinho mantidos', store.includes('setCartOpen(true)') && store.includes('reviewCheckout') && store.includes('createPublicOrder(')],
  ['Textos e rótulos essenciais permanecem nos três idiomas', ['Escolha seus produtos', 'Choose your products', '商品を選ぶ'].every(value => store.includes(value))],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  assert.ok(ok, `Falhou: ${name}`);
}
console.log(`\n${checks.length}/${checks.length} verificações UX v3 aprovadas.`);
