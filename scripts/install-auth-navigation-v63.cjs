#!/usr/bin/env node
/* Correção cirúrgica: bloqueia redirecionamentos de role e links de loja antigos.
 * --check testa os marcadores sem modificar o projeto.
 * --apply gera backups fora do repositório e instala as alterações.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = process.cwd();
const sourceRoot = path.resolve(__dirname, '_auth-v63-assets');
const mode = process.argv.includes('--apply') ? 'apply' : 'check';
const edits = new Map();

function load(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${rel}`);
  return edits.get(rel) || fs.readFileSync(file, 'utf8');
}
function once(rel, find, replacement, label) {
  const src = load(rel);
  const matches = src.match(find instanceof RegExp ? new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags + 'g') : new RegExp(escape(find), 'g')) || [];
  if (matches.length !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${matches.length}. Não aplique sobre uma versão divergente.`);
  edits.set(rel, src.replace(find, replacement));
}
function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

try {
  const navFile = path.join(root, 'app/_components/RoleNavigation.tsx');
  const helperFile = path.join(root, 'app/lib/customer-store-context.ts');
  const chooserFile = path.join(root, 'app/customer/stores/page.tsx');
  if (fs.existsSync(helperFile) && fs.existsSync(chooserFile) && fs.existsSync(navFile) &&
      fs.readFileSync(navFile, 'utf8').includes('readCustomerContext(session.user?.uid)')) {
    console.log('✓ Correção de navegação v6.3 já está instalada.');
    process.exit(0);
  }
  const nav = 'app/_components/RoleNavigation.tsx';
  once(nav, 'import useCustomerSession from "@/app/hooks/useCustomerSession";', 'import useCustomerSession from "@/app/hooks/useCustomerSession";\nimport { readCustomerStoreContext, rememberCustomerStoreContext } from "@/app/lib/customer-store-context";', 'import de contexto seguro');
  once(nav, /function readCustomerContext\(\) \{[\s\S]*?\n\}\n\nexport function CustomerNav\(\)/,
    'function readCustomerContext(uid: string | undefined) {\n  return readCustomerStoreContext(uid);\n}\n\nexport function CustomerNav()', 'contexto legado global');
  once(nav,
    'const [context, setContext] = useState(() => ({ storeHref: "/", sellerId: "" }));',
    'const [context, setContext] = useState(() => ({ storeHref: "/customer/stores", sellerId: "" }));',
    'valor inicial do contexto');
  once(nav,
    '    setContext(readCustomerContext());\n  }, [pathname]);',
    '    setContext(readCustomerContext(session.user?.uid));\n  }, [pathname, session.user?.uid]);',
    'contexto por UID');
  once(nav,
    '    { href: context.storeHref, label: copy.store, icon: Store, exact: context.storeHref === "/" },',
    '    { href: context.storeHref, label: copy.store, icon: Store, exact: true },',
    'navegação da loja sem raiz /');
  once(nav,
    '<Brand label={session.displayName || copy.customer} href={context.storeHref} name={sellerIdentity.storeName || copy.store} logoUrl={sellerIdentity.logoUrl} primaryColor={sellerIdentity.primaryColor} />',
    '<Brand label={session.displayName || copy.customer} href={context.storeHref} name={context.sellerId ? (sellerIdentity.storeName || copy.store) : PLATFORM_NAME} logoUrl={context.sellerId ? sellerIdentity.logoUrl : PLATFORM_LOGO_PATH} primaryColor={sellerIdentity.primaryColor} />',
    'cabeçalho cliente sem loja falsa');
  once(nav,
    '    if (sellerId) window.localStorage.setItem(LAST_SELLER_KEY, sellerId);\n  }, [resolvedStoreHref, sellerId]);',
    '    if (sellerId) window.localStorage.setItem(LAST_SELLER_KEY, sellerId);\n    if (session.accountRole === "customer" && session.user?.uid) {\n      rememberCustomerStoreContext(session.user.uid, resolvedStoreHref);\n    }\n  }, [resolvedStoreHref, sellerId, session.accountRole, session.user?.uid]);',
    'salvar loja do cliente autenticado');

  const customerLogin = 'app/customer/login/page.tsx';
  once(customerLogin,
    /function safeNext\(value: string \| null\): string \{[\s\S]*?\n\}/,
    `function safeNext(value: string | null): string {\n  if (!value || !value.startsWith(\"/\") || value.startsWith(\"//\") || value.includes(\"\\\\\")) return \"/customer/orders\";\n  // Nunca regressar a /login, /seller, /admin ou / (que abre login comercial).\n  const pathname = value.split(/[?#]/)[0] || \"\";\n  const allowed = /^\\/customer\\/(orders|profile|rewards|stores)(\\/|$)/.test(pathname)\n    || /^\\/store\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname)\n    || /^\\/event\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname)\n    || /^\\/c\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname);\n  return allowed ? value : \"/customer/orders\";\n}`,
    'destino permitido do login cliente');

  const session = 'app/hooks/useCustomerSession.ts';
  once(session,
    '        const profile = await loadProfile(nextUser);',
    '        if (resolved.role !== "customer") {\n          setError(resolved.issue\n            ? "A conta está com um conflito de permissões. Entre em contato com o administrador."\n            : "Esta conta ainda não possui um perfil de cliente válido.");\n          return;\n        }\n        const profile = await loadProfile(nextUser);',
    'não presumir que unknown é customer');

  const backend = 'app/api/auth/resolve-role/route.ts';
  once(backend,
    /function safeNext\(value: unknown\): string \{[\s\S]*?\n\}/,
    `function safeNext(value: unknown): string {\n  const normalized = typeof value === \"string\" ? value.trim() : \"\";\n  if (!normalized.startsWith(\"/\") || normalized.startsWith(\"//\") || normalized.includes(\"\\\\\")) return \"/customer/orders\";\n  const pathname = normalized.split(/[?#]/)[0] || \"\";\n  const allowed = /^\\/customer\\/(orders|profile|rewards|stores)(\\/|$)/.test(pathname)\n    || /^\\/store\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname)\n    || /^\\/event\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname)\n    || /^\\/c\\/[a-zA-Z0-9_-]{4,150}(\\/|$)/.test(pathname);\n  return allowed ? normalized : \"/customer/orders\";\n}`,
    'destino seguro do backend de roles');

  for (const file of ['app/lib/customer-store-context.ts', 'app/customer/stores/page.tsx']) {
    const dest = path.join(root, file);
    if (fs.existsSync(dest)) throw new Error(`${file} já existe; não substituído.`);
    edits.set(file, fs.readFileSync(path.join(sourceRoot, file), 'utf8'));
  }
  if (mode === 'check') {
    console.log(`✓ ${edits.size} arquivos preparados para corrigir navegação/login; nenhum arquivo modificado.`);
    process.exit(0);
  }
  const backupDir = path.join(os.homedir(), 'Downloads', `order-system-auth-backup-v63-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  for (const [rel, contents] of edits) {
    const dest = path.join(root, rel);
    if (fs.existsSync(dest)) {
      const backup = path.join(backupDir, rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(dest, backup);
    }
  }
  for (const [rel, contents] of edits) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, contents, 'utf8');
    console.log('✓', rel);
  }
  console.log(`Backup local: ${backupDir}`);
} catch (error) {
  console.error('✗ ' + (error instanceof Error ? error.message : error));
  process.exit(1);
}
