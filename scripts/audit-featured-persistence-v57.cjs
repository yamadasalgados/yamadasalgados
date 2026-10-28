#!/usr/bin/env node
/* Regressão da gravação do destaque: somente leitura local, sem acesso ao Firebase. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const file = 'app/seller/products/ProductModal.tsx';
const source = fs.readFileSync(file, 'utf8');
const saveStart = source.indexOf('const handleSubmit = useCallback(async () => {');
const saveEnd = source.indexOf('if (!mounted || !open) return null;', saveStart);
assert.ok(saveStart !== -1 && saveEnd > saveStart, 'Não localizei o salvamento do ProductModal.');
const save = source.slice(saveStart, saveEnd);
const depStart = save.lastIndexOf('  }, [');
assert.ok(depStart !== -1, 'Não localizei a lista de dependências de handleSubmit.');
const dependencies = save.slice(depStart).split(']);')[0];
const checks = [
  ['O botão muda o estado local', source.includes('setFeaturedInStore(event.target.checked)') || fs.readFileSync('app/seller/products/ProductForm.tsx', 'utf8').includes('setFeaturedInStore(event.target.checked)')],
  ['featuredInStore está nas dependências do salvamento (evita valor antigo)', /\bfeaturedInStore\s*,/.test(dependencies)],
  ['O valor é enviado ao Firestore', /\bfeaturedInStore\s*,\s*storefront:/.test(save)],
  ['O servidor é consultado depois de salvar', /getDocFromServer\(persistedReference!\)/.test(save)],
  ['O valor confirmado pelo servidor é comparado ao solicitado', /persistedFeatured\s*!==\s*featuredInStore/.test(save)],
  ['Apenas o valor persistido atualiza a interface', /savedProduct = \{ \.\.\.savedProduct, featuredInStore: persistedFeatured \}/.test(save)],
  ['Existe erro específico se a confirmação falhar', /message === "FEATURED_NOT_PERSISTED"/.test(save)],
];
let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (ok) passed++;
}
console.log(`${passed}/${checks.length} verificações.`);
if (passed !== checks.length) process.exitCode = 1;
