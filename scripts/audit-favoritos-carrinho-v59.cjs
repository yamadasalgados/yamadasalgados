const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const store = fs.readFileSync(path.join(process.cwd(), 'app/store/[sellerId]/StoreClient.tsx'), 'utf8');
const shelf = fs.readFileSync(path.join(process.cwd(), 'app/_components/StoreWishlist.tsx'), 'utf8');
const tests = [
  ['Shelf inclui ações de carrinho', () => assert.match(shelf, /onAdd, onDecrease, onConfigureBundle/)],
  ['Shelf permite adicionar sem sair de favoritos', () => assert.match(shelf, /onClick=\{\(\) => onAdd\(p\.id\)\}/)],
  ['Shelf permite diminuir quantidade', () => assert.match(shelf, /onClick=\{\(\) => onDecrease\(p\.id\)\}/)],
  ['Shelf mostra quantidade e preço', () => { assert.match(shelf, /\{p\.quantity\}/); assert.match(shelf, /\{p\.priceLabel\}/); }],
  ['Shelf bloqueia adicionar quando esgotado', () => assert.match(shelf, /disabled=\{p\.soldOut \|\| p\.atStockLimit\}/)],
  ['Shelf usa configurador de kits', () => assert.match(shelf, /onConfigureBundle\(p\.id\)/)],
  ['Shelf preserva alerta de reposição', () => assert.match(shelf, /wishlist\.setAlerts\(e\.target\.checked\)/)],
  ['Loja mantém carrinho central', () => assert.match(store, /const setQuantity\s*=\s*useCallback/)],
  ['Favoritos chamam método central de carrinho', () => assert.match(store, /onAdd=\{\(id\) => \{ const p = products\.find\(item => item\.id === id && item\.publiclyVisible\); if \(p\) setQuantity\(p, \(cart\[id\] \?\? 0\) \+ 1\); \}\}/)],
  ['Modal de detalhes também permite adicionar', () => assert.match(store, /cartCopy\.add/)],
  ['Modal respeita estoque', () => assert.match(store, /disabled=\{soldOut \|\| atStockLimit\}/)],
  ['Modal usa configurador de kits sem dois modais simultâneos', () => assert.match(store, /setSelectedProduct\(null\);\s*setConfiguringBundle\(product\)/)],
  ['Sem novas escritas diretas no Firestore', () => { assert.doesNotMatch(shelf, /updateDoc|setDoc|addDoc|collection\(/); }],
];
let passed = 0;
for(const [title, fn] of tests){try { fn(); passed++; console.log('✓ '+title); }catch(error){console.error('✗ '+title); console.error(error.message);process.exitCode=1;}}
console.log(`${passed}/${tests.length} verificações da UX v5.9 aprovadas.`);
