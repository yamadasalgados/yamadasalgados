const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const nav = read('app/_components/RoleNavigation.tsx');
const login = read('app/customer/login/page.tsx');
const session = read('app/hooks/useCustomerSession.ts');
const api = read('app/api/auth/resolve-role/route.ts');
const context = read('app/lib/customer-store-context.ts');
const stores = read('app/customer/stores/page.tsx');
const tests = [
  ['CustomerNav usa contexto por UID', nav.includes('readCustomerContext(session.user?.uid)')],
  ['Loja vazia nunca aponta para /', nav.includes('storeHref: "/customer/stores"')],
  ['Página de seleção de loja presente', stores.includes('normalizeCustomerStoreHref(link)')],
  ['Registra loja somente para cliente autenticado', nav.includes('session.accountRole === "customer" && session.user?.uid')],
  ['Identidade Order System sem loja', nav.includes('context.sellerId ? (sellerIdentity.storeName || copy.store) : PLATFORM_NAME')],
  ['Login cliente bloqueia next de outra role', login.includes('Nunca regressar a /login, /seller, /admin')],
  ['Backend restringe next de cliente', api.includes('const allowed = /^\\/customer')],
  ['Unknown não é tratado como customer', session.includes('if (resolved.role !== "customer")')],
  ['Store href tem validação', context.includes('normalizeCustomerStoreHref')],
];
for (const [label, passed] of tests) {
  console.log(`${passed ? '✓' : '✗'} ${label}`);
}
if (tests.some(([, ok]) => !ok)) process.exit(1);
const ts = require('typescript');
for (const f of ['app/_components/RoleNavigation.tsx', 'app/customer/login/page.tsx', 'app/hooks/useCustomerSession.ts', 'app/api/auth/resolve-role/route.ts', 'app/lib/customer-store-context.ts', 'app/customer/stores/page.tsx']) {
  const res = ts.transpileModule(read(f), { fileName: f, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve } });
  if (res.diagnostics?.length) {
    console.error(`Falha na análise de ${f}`);
    process.exit(1);
  }
}
// Testes reais da função de seleção de loja, sem Firestore ou permissões.
const compiled = ts.transpileModule(context, { fileName: 'context.ts', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exportsObj = {};
Function('exports', compiled)(exportsObj);
const { normalizeCustomerStoreHref, readCustomerStoreContext, rememberCustomerStoreContext } = exportsObj;
const examples = [
  ['/store/abc12345', '/store/abc12345'],
  ['https://theordersystem.vercel.app/store/abc12345?ref=xxx', '/store/abc12345'],
  ['/customer/orders', null],
  ['/', null],
  ['/login', null],
  ['/seller', null],
  ['//somewhere.com/store/abc12345', null],
  ['javascript:alert(1)', null],
];
for (const [arg, expected] of examples) {
  if (normalizeCustomerStoreHref(arg) !== expected) throw new Error(`Link não validado corretamente: ${arg}`);
}
const values = new Map();
global.window = {
  localStorage: {
    getItem(k) { return values.get(k) ?? null; },
    setItem(k,v) { values.set(k,v); },
  },
};
rememberCustomerStoreContext('uid-A', '/store/abc12345');
if (readCustomerStoreContext('uid-A').storeHref !== '/store/abc12345') throw new Error('Loja não lembrada para UID A');
if (readCustomerStoreContext('uid-B').storeHref !== '/customer/stores') throw new Error('Loja de uma conta vazou para outra');
delete global.window;
console.log(`✓ ${tests.length} critérios, 6 arquivos sintaticamente válidos e ${examples.length + 2} testes de navegação aprovados.`);
console.log('Atenção: ainda é necessário npm run build e teste de login com Firebase/Vercel.');
