#!/usr/bin/env node
/**
 * v6.5 surgical installer, preserves all unrelated features; no partial writes.
 * --check: compatibility check, does not write.
 * --apply: creates backups before writing, requires exact anchors and guards.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = process.cwd();
const assetRoot = path.join(__dirname, '_discovery-v65-files');
const doApply = process.argv.includes('--apply');
const staged = new Map();

function requireFile(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`${rel} não encontrado. Instale a v6.4 antes.`);
  return fs.readFileSync(file, 'utf8');
}
function replaceOnce(content, oldText, newText, name) {
  if (content.includes(newText)) return content;
  if (content.split(oldText).length !== 2) {
    throw new Error(`O trecho esperado em ${name} não confere. Não sobrescreva: adapte ao código atual.`);
  }
  return content.replace(oldText, newText);
}
function stageText(rel, next) {
  const file = path.join(root, rel);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current !== next) staged.set(rel, Buffer.from(next, 'utf8'));
}
function stageAsset(rel) {
  const asset = path.join(assetRoot, rel);
  const file = path.join(root, rel);
  const bytes = fs.readFileSync(asset);
  // Never overwrite an existing new API/component with unknown changes.
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file);
    if (!existing.equals(bytes)) {
      throw new Error(`${rel} já existe com diferenças. Verifique antes de aplicar.`);
    }
  } else {
    staged.set(rel, bytes);
  }
}

try {
  const searchFile = 'app/api/public/stores/search/route.ts';
  let search = requireFile(searchFile);
  search = replaceOnce(search,
    '"currentPeriodEnd", "active", "suspended", "plan", "billingInterval",',
    '"currentPeriodEnd", "active", "suspended", "plan", "billingInterval", "discoverableInSearch",',
    searchFile,
  );
  search = replaceOnce(search,
    '      const data = doc.data();\n      // Loja com status desconhecido',
    '      const data = doc.data();\n      // Opt-in explícito: campo ausente ou falso NUNCA entra no diretório.\n      if (data.discoverableInSearch !== true) continue;\n      // Loja com status desconhecido',
    searchFile,
  );
  // Require both guards (fail closed in future modifications).
  if (!search.includes('"discoverableInSearch"') ||
      !search.includes('if (data.discoverableInSearch !== true) continue;')) {
    throw new Error('Guarda de visibilidade não foi adicionada corretamente.');
  }
  stageText(searchFile, search);

  const identityFile = 'app/seller/settings/identity/page.tsx';
  let identity = requireFile(identityFile);
  identity = replaceOnce(identity,
    'import SellerIdentitySettingsCard from "@/app/seller/settings/SellerIdentitySettingsCard";',
    'import SellerIdentitySettingsCard from "@/app/seller/settings/SellerIdentitySettingsCard";\nimport StoreDiscoverySettingsCard from "@/app/seller/settings/StoreDiscoverySettingsCard";',
    identityFile,
  );
  identity = replaceOnce(identity,
    '      <SellerIdentitySettingsCard language={lang} />',
    '      <SellerIdentitySettingsCard language={lang} />\n      <StoreDiscoverySettingsCard />',
    identityFile,
  );
  stageText(identityFile, identity);

  for (const file of [
    'app/api/seller/store-discovery/route.ts',
    'app/seller/settings/StoreDiscoverySettingsCard.tsx',
  ]) stageAsset(file);

  if (!doApply) {
    console.log(`✓ Verificação v6.5 aprovada (${staged.size} arquivos a criar/alterar; nenhuma modificação).`);
    process.exit(0);
  }

  const backupDir = path.join(os.homedir(), 'Downloads', `order-system-v65-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  // Read current destination bytes before applying ANY changes.
  for (const [rel] of staged) {
    const current = path.join(root, rel);
    if (fs.existsSync(current)) {
      const copy = path.join(backupDir, rel);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(current, copy);
    }
  }
  for (const [rel, content] of staged) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    console.log('✓', rel);
  }
  if (staged.size) console.log(`Backup: ${backupDir}`);
  console.log('✓ v6.5 instalada. Execute a auditoria e npm run build.');
} catch (error) {
  console.error('✗', error instanceof Error ? error.message : error);
  process.exit(1);
}
