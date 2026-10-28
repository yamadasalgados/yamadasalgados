#!/usr/bin/env node
/**
 * Order System v6.6: retain each customer's last chosen store and bypass the
 * chooser unless they explicitly select "Change store" from their profile.
 *
 * Check is read-only; apply makes local backups and stages changes atomically.
 * Does not change roles, Firestore rules, auth, rewards or seller visibility.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = process.cwd();
const apply = process.argv.includes('--apply');
const staged = new Map();

function requireSource(relativePath) {
  const file = path.resolve(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${relativePath}. Instale primeiro a v6.5.`);
  return fs.readFileSync(file, 'utf8');
}
function replaceOnce(source, from, to, file) {
  if (source.includes(to)) return source;
  if (source.split(from).length !== 2) {
    throw new Error(`Trecho esperado não encontrado uma única vez em ${file}. Versão divergente; não aplique o pacote.`);
  }
  return source.replace(from, to);
}
function stage(relativePath, source, updated) {
  if (source !== updated) staged.set(relativePath, updated);
}

try {
  // Do NOT change the current UID-scoped key or move any customer points.
  const contextFile = 'app/lib/customer-store-context.ts';
  const context = requireSource(contextFile);
  if (!context.includes('order_system_customer_store_by_uid_v63:') ||
      !context.includes('readCustomerStoreContext(uid:') ||
      !context.includes('rememberCustomerStoreContext(uid:')) {
    throw new Error('Armazenamento de loja não está isolado por UID. Instale a v6.3 antes.');
  }

  const storesFile = 'app/customer/stores/page.tsx';
  let chooser = requireSource(storesFile);
  chooser = replaceOnce(
    chooser,
    '  const [recent, setRecent] = useState("");',
    '  const [recent, setRecent] = useState("");\n  const [checkingSavedStore, setCheckingSavedStore] = useState(true);',
    storesFile,
  );
  chooser = replaceOnce(
    chooser,
    `  useEffect(() => {
    const saved = readCustomerStoreContext(session.user?.uid);
    setRecent(saved.sellerId ? saved.storeHref : "");
  }, [session.user?.uid]);`,
    `  useEffect(() => {
    if (session.loading) return;
    const saved = readCustomerStoreContext(session.user?.uid);
    setRecent(saved.sellerId ? saved.storeHref : "");

    // ?change=1 is reserved for deliberate store switching from My profile.
    // Never redirect a logged-out person, and never pick another UID's store.
    const isChangingStore = new URLSearchParams(window.location.search).get("change") === "1";
    if (session.registered && saved.sellerId && !isChangingStore) {
      router.replace(saved.storeHref);
      return;
    }
    setCheckingSavedStore(false);
  }, [router, session.loading, session.registered, session.user?.uid]);`,
    storesFile,
  );
  chooser = replaceOnce(
    chooser,
    `    router.push(path);
  }

  return (`,
    `    router.push(path);
  }

  // Avoid showing the search form briefly while sending returning customers
  // directly to their saved store.
  if (checkingSavedStore) {
    return (
      <main className="mx-auto flex min-h-40 items-center justify-center px-4 py-12" aria-live="polite">
        <Loader2 size={24} className="animate-spin text-neutral-500" aria-label={text.searching} />
      </main>
    );
  }

  return (`,
    storesFile,
  );
  stage(storesFile, requireSource(storesFile), chooser);

  const navFile = 'app/_components/RoleNavigation.tsx';
  let nav = requireSource(navFile);
  nav = replaceOnce(
    nav,
    '{ href: "/customer/stores", label: copy.store, icon: Store, exact: true },',
    '{ href: context.storeHref, label: copy.store, icon: Store, exact: true },',
    navFile,
  );
  // Ensure storeHref comes from the authenticated user's private local context.
  if (!nav.includes('readCustomerContext(session.user?.uid)') ||
      !nav.includes('readCustomerStoreContext(uid)')) {
    throw new Error('Navegação não está ligada ao cliente autenticado. Não aplique a atualização.');
  }
  stage(navFile, requireSource(navFile), nav);

  const profileFile = 'app/customer/profile/page.tsx';
  let profile = requireSource(profileFile);
  if (!profile.includes('storeSwitcherTitle:')) {
    // Inject the same copy in the existing pt/en/ja translations.
    for (const [anchor, insertion] of [
      ['    notifications: "Notificações",', '    storeSwitcherTitle: "Minha loja",\n    storeSwitcherHelp: "Seu acesso à loja fica salvo para as próximas visitas. Você pode mudar de loja quando quiser. Os pontos continuam separados por estabelecimento.",\n    changeStore: "Trocar de loja",\n    notifications: "Notificações",'],
      ['    notifications: "Notifications",', '    storeSwitcherTitle: "My store",\n    storeSwitcherHelp: "Your selected store is remembered for future visits. You can switch stores at any time. Points remain separate for each store.",\n    changeStore: "Change store",\n    notifications: "Notifications",'],
      ['    notifications: "通知",', '    storeSwitcherTitle: "利用するお店",\n    storeSwitcherHelp: "次回から同じお店を自動的に開きます。お店はいつでも変更できます。ポイントは店舗ごとに管理されます。",\n    changeStore: "お店を変更",\n    notifications: "通知",'],
    ]) profile = replaceOnce(profile, anchor, insertion, profileFile);
  }
  const section = `        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <div className="flex items-center gap-2">
            <Store size={20} aria-hidden="true" />
            <h2 className="text-lg font-black">{text.storeSwitcherTitle}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{text.storeSwitcherHelp}</p>
          <Link href="/customer/stores?change=1" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            {text.changeStore} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>

`;
  if (!profile.includes('href="/customer/stores?change=1"')) {
    const anchor = '        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">\n          <h2 className="text-lg font-black">{text.personal}</h2>';
    profile = replaceOnce(profile, anchor, section + anchor, profileFile);
  }
  const icons = profile.match(/^import \{([^}]+)\} from "lucide-react";/m);
  if (!icons) throw new Error('Import lucide-react divergente. Não altere o perfil.');
  const names = icons[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of ['Store', 'ArrowRight']) if (!names.includes(name)) names.push(name);
  profile = profile.replace(icons[0], `import { ${names.join(', ')} } from "lucide-react";`);
  stage(profileFile, requireSource(profileFile), profile);

  if (!apply) {
    console.log(`✓ Verificação v6.6: ${staged.size} arquivos a ajustar. Nenhum arquivo modificado.`);
    process.exit(0);
  }
  const backup = path.join(os.homedir(), 'Downloads', `order-system-store-home-backup-v66-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  for (const [rel] of staged) {
    const target = path.join(root, rel);
    const safe = path.join(backup, rel);
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.copyFileSync(target, safe);
  }
  for (const [rel, next] of staged) {
    fs.writeFileSync(path.join(root, rel), next, 'utf8');
    console.log('✓', rel);
  }
  console.log(`✓ Atualização v6.6 aplicada. Backup: ${backup}`);
  console.log('Execute: node scripts/audit-customer-store-home-v66.cjs && npm run build');
} catch (error) {
  console.error('✗ ' + (error instanceof Error ? error.message : error));
  process.exit(1);
}
