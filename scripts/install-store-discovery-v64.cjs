#!/usr/bin/env node
/* Instalacao v6.4: conferencias exatas para evitar sobrescrever atualizacoes novas. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = process.cwd();
const source = path.join(__dirname, '_store-discovery-v64-assets');
const apply = process.argv.includes('--apply');
const changed = new Map();

const knownHashes = new Map([
  ['app/customer/stores/page.tsx', '6900f73d70961aea11b82924e5e38d37fe0e38d9162641c42c5af729393b092c'],
  ['app/hooks/useCustomerRewards.ts', '61f9df6aedf7d9c9d64a0101149af7ba746ad50c8f4e3a61936b922575f715e0'],
]);
const paths = [
  'app/customer/stores/page.tsx',
  'app/hooks/useCustomerRewards.ts',
  'app/api/public/stores/search/route.ts',
];
function sha(input) {return crypto.createHash('sha256').update(input).digest('hex');}
function getLocal(rel) { const p=path.join(root,rel);return fs.existsSync(p)?fs.readFileSync(p):null; }
try {
  for (const rel of paths) {
    const input = fs.readFileSync(path.join(source, rel));
    const current = getLocal(rel);
    if (current && sha(current)===sha(input)) continue;
    if (!current && knownHashes.has(rel)) throw new Error(`Nao foi encontrado ${rel}. Instale antes a v6.3.`);
    if (current && (!knownHashes.has(rel) || sha(current)!==knownHashes.get(rel))) {
      throw new Error(`${rel} foi modificado fora da versao esperada. Nao sobrescreva; adapte manualmente a v6.4.`);
    }
    changed.set(rel, input);
  }

  const nav = 'app/_components/RoleNavigation.tsx';
  const currentNav = getLocal(nav);
  if (!currentNav) throw new Error(`Arquivo ausente: ${nav}`);
  const before = '{ href: context.storeHref, label: copy.store, icon: Store, exact: true },';
  const after = '{ href: "/customer/stores", label: copy.store, icon: Store, exact: true },';
  const navText = currentNav.toString('utf8');
  if (navText.includes(after)) {
    // Ja instalado.
  } else if (navText.split(before).length === 2) {
    changed.set(nav, Buffer.from(navText.replace(before,after)));
  } else {
    throw new Error('Navegacao nao corresponde a v6.3. Nenhuma alteracao realizada.');
  }

  if (!apply) {
    console.log(`✓ Verificacao v6.4: ${changed.size} arquivos a modificar; nenhum arquivo alterado.`);
    process.exit(0);
  }
  const backup = path.join(os.homedir(), 'Downloads', `order-system-v64-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  for (const [rel, input] of changed) {
    const dest = path.join(root, rel);
    if (fs.existsSync(dest)) {
      const b = path.join(backup,rel);
      fs.mkdirSync(path.dirname(b),{recursive:true});
      fs.copyFileSync(dest,b);
    }
  }
  for (const [rel, input] of changed) {
    const dest = path.join(root,rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,input);
    console.log('✓',rel);
  }
  if (changed.size > 0) console.log('Backups anteriores:',backup);
  console.log('✓ Instalacao v6.4 concluida. Execute npm run build.');
} catch(error) {
  console.error('✗',error instanceof Error?error.message:error);
  process.exit(1);
}
