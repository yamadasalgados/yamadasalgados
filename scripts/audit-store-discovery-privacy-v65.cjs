#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const base = process.cwd();
function contents(file) { return fs.readFileSync(path.join(base, file), 'utf8'); }
const checks = [
  ['Busca exige opt-in verdadeiro', () => contents('app/api/public/stores/search/route.ts').includes('if (data.discoverableInSearch !== true) continue;')],
  ['Busca projeta o novo campo', () => contents('app/api/public/stores/search/route.ts').includes('"discoverableInSearch"')],
  ['Nenhuma mudança no acesso por link', () => !contents('app/api/public/stores/search/route.ts').includes('redirect(')],
  ['Somente seller ativo e owner gerenciam', () => {
    const s=contents('app/api/seller/store-discovery/route.ts');
    return s.includes('user?.role !== "seller"') && s.includes('user?.accountStatus !== "active"') && s.includes('seller?.ownerUid !== identity.uid');
  }],
  ['Token verificado com revogação', () => contents('app/api/seller/store-discovery/route.ts').includes('verifyIdToken(bearer, true)')],
  ['POST exige booleano explícito', () => contents('app/api/seller/store-discovery/route.ts').includes('typeof body.discoverableInSearch !== "boolean"')],
  ['Padrão é não listada', () => contents('app/api/seller/store-discovery/route.ts').includes('snapshot.data()?.discoverableInSearch === true')],
  ['Salvamento feito pelo Admin SDK', () => contents('app/api/seller/store-discovery/route.ts').includes('await actor.ref.update({')],
  ['Seller encontra opção em Identidade', () => contents('app/seller/settings/identity/page.tsx').includes('<StoreDiscoverySettingsCard />')],
  ['Interface em PT, EN e JA', () => {
    const s = contents('app/seller/settings/StoreDiscoverySettingsCard.tsx'); return s.includes('pt: {') && s.includes('en: {') && s.includes('ja: {');
  }],
  ['Controle salva apenas com ação do seller', () => {
    const s=contents('app/seller/settings/StoreDiscoverySettingsCard.tsx'); return s.includes('onClick={() => void save()}') && s.includes('disabled={!dirty || busy}');
  }],
  ['Explica que não listada não é privada', () => contents('app/seller/settings/StoreDiscoverySettingsCard.tsx').includes('Não listada não significa privada')],
];
let failures=0;
for (const [name, check] of checks) {
  let okay=false;
  try { okay=check(); } catch { okay=false; }
  console.log(`${okay ? '✓' : '✗'} ${name}`);
  if (!okay) failures++;
}
console.log(`${checks.length - failures}/${checks.length} verificações v6.5 aprovadas.`);
process.exitCode=failures ? 1 : 0;
