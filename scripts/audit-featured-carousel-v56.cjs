#!/usr/bin/env node
/* Structural, dependency-free checks for carousel v5.6. Never touches Firebase. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const files = {
  form: 'app/seller/products/ProductForm.tsx',
  modal: 'app/seller/products/ProductModal.tsx',
  types: 'app/seller/products/product-types.ts',
  seller: 'app/seller/products/page.tsx',
  store: 'app/store/[sellerId]/StoreClient.tsx',
};
const s = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const tests = [
  ['Opção de destaque editável no cadastro de produtos', () => { assert.match(s.form, /type="checkbox" checked=\{featuredInStore\}/); assert.match(s.form, /setFeaturedInStore/); }],
  ['A configuração é salva no banco junto ao produto', () => { assert.match(s.modal, /featuredInStore,\s*storefront:/); assert.match(s.modal, /featuredInStore: payload\.featuredInStore/); }],
  ['O estado é restaurado ao editar', () => { assert.match(s.modal, /featuredInStore: activeProduct\?\.featuredInStore === true/); assert.match(s.modal, /setFeaturedInStore\(nextState\.featuredInStore\)/); }],
  ['Mudanças são monitoradas pelo formulário', () => { assert.match(s.modal, /featuredInStore,\s*storefrontSubgroup,/); }],
  ['Produtos legados não aparecem como destaque automaticamente', () => { assert.match(s.seller, /featuredInStore: data\.featuredInStore === true/); assert.match(s.store, /featuredInStore: raw\.featuredInStore === true/); }],
  ['Não exibe produtos ocultos como destaque', () => { assert.match(s.store, /product\.publiclyVisible && product\.featuredInStore/); }],
  ['Carrinho e kits continuam reaproveitando fluxos existentes', () => { assert.match(s.store, /onConfigureBundle=\{setConfiguringBundle\}/); assert.match(s.store, /onSetQuantity=\{setQuantity\}/); }],
  ['Carrossel invisível quando vazio', () => { assert.match(s.store, /featuredProducts\.length > 0 &&/); }],
  ['Carrossel somente no topo da lista principal', () => { assert.match(s.store, /!selectedCategory && !fulfillmentFilter && !showAllProducts && !search\.trim\(\) && featuredProducts\.length > 0/); }],
  ['Carrossel suporta gesto horizontal e snap', () => { assert.match(s.store, /snap-x snap-mandatory/); assert.match(s.store, /overflow-x-auto/); }],
  ['Setas aparecem de acordo com overflow real', () => { assert.match(s.store, /track\.scrollLeft \+ track\.clientWidth < track\.scrollWidth - 3/); assert.match(s.store, /ResizeObserver/); }],
  ['Disponível em português, inglês e japonês', () => { for (const name of ['Novidades e destaques', 'New & featured', '新着・おすすめ']) assert.ok(s.store.includes(name)); }],
  ['A adição respeita estoque e kits configuráveis', () => { assert.match(s.store, /disabled=\{soldOut\}/); assert.match(s.store, /bundle \? onConfigureBundle\(product\) : onSetQuantity/); }],
  ['Sem migração, sem gravação de clientes, pontos ou pedidos', () => { assert.equal((s.store.match(/featuredInStore: raw\.featuredInStore === true/g)??[]).length,1); assert.ok(!fs.existsSync('scripts/activate-featured-prod.cjs')); }],
];
let failures=0;
for (const [title,run] of tests) { try {run(); console.log(`✓ ${title}`);} catch(e){failures++;console.error(`✗ ${title}: ${e.message}`);} }
try {
  const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
  for(const name of Object.values(files)) {
    const result=ts.transpileModule(fs.readFileSync(name,'utf8'),{fileName:name,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
    const errs=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errs.length) throw new Error(`${name}: ${errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' | ')}`);
  }
  console.log('✓ TS/TSX: sintaxe válida (TypeScript global)');
} catch(e) {
  if(e.code==='MODULE_NOT_FOUND') console.log('ℹ Sintaxe TS/TSX não verificada: execute npm run build.');
  else { failures++; console.error(`✗ Sintaxe TS/TSX: ${e.message}`); }
}
console.log(`${tests.length-failures}/${tests.length} verificações estruturais aprovadas.`);
process.exitCode=failures?1:0;
