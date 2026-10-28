#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
function file(path) {return fs.readFileSync(path, 'utf8');}
const c = file('app/customer/stores/page.tsx');
const n = file('app/_components/RoleNavigation.tsx');
const p = file('app/customer/profile/page.tsx');
const s = file('app/lib/customer-store-context.ts');
const checks = [
  ['Loja lembrada separadamente por UID', () => assert.match(s, /order_system_customer_store_by_uid_v63:/)],
  ['Sem loja salva, pesquisa continua disponível', () => assert.match(c, /setCheckingSavedStore\(false\)/)],
  ['Aguardar autenticação antes de decidir', () => assert.match(c, /if \(session\.loading\) return;/)],
  ['Apenas cliente autenticado é redirecionado', () => assert.match(c, /session\.registered && saved\.sellerId && !isChangingStore/)],
  ['Reabrir loja com replace, sem ciclo no histórico', () => assert.match(c, /router\.replace\(saved\.storeHref\)/)],
  ['Modo explícito para trocar loja', () => assert.match(c, /get\("change"\) === "1"/)],
  ['Loja no menu abre a última escolha', () => assert.match(n, /href: context\.storeHref, label: copy\.store/)],
  ['Perfil oferece Trocar de loja', () => assert.match(p, /href="\/customer\/stores\?change=1"/)],
  ['Perfil oferece textos PT/EN/JA', () => assert.equal((p.match(/storeSwitcherTitle:/g) || []).length, 3)],
  ['Seleção busca registra nova loja', () => assert.match(c, /rememberCustomerStoreContext\(session\.user\?\.uid, path\)/)],
  ['Proteção de contexto não aceita raiz genérica', () => assert.match(s, /\^\\\/store\\\//)],
];
for (const [description, test] of checks) {test();console.log('✓', description);}
console.log(`${checks.length}/${checks.length} verificações de navegação v6.6 aprovadas.`);
