#!/usr/bin/env node
"use strict";
/**
 * Order System v6.1 — instalação segura e repetível dos dois visuais aprovados.
 * Somente altera RootLayout, marca visual do login e ícones/arquivos estáticos.
 * Não altera autenticação, rotas, sellers, pedidos, Firestore ou funções.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = process.cwd();
const source = "brand-v61/assets";
const copyMap = [
  ["platform-logo.png", "public/platform-logo.png"],
  ["order-system-footer.png", "public/order-system-footer.png"],
  ["icon-192x192.png", "public/icon-192x192.png"],
  ["icon-512x512.png", "public/icon-512x512.png"],
  ["icon-maskable-512x512.png", "public/icon-maskable-512x512.png"],
  ["apple-touch-icon.png", "public/apple-touch-icon.png"],
  ["favicon.ico", "public/favicon.ico"],
  ["favicon.ico", "app/favicon.ico"],
];
const footerSource = "brand-v61/PlatformBrandFooter.tsx";
const footerDestination = "app/_components/PlatformBrandFooter.tsx";
const layoutDestination = "app/layout.tsx";
const loginBrandDestination = "app/_components/PlatformLoginBrand.tsx";
const manifestDestinations = ["public/manifest.json", "public/manifest.webmanifest"];
const layoutAnchor = '<main className="flex-1 flex flex-col">{children}</main>';
const footerJSX = '<PlatformBrandFooter />';
const footerImport = 'import PlatformBrandFooter from "@/app/_components/PlatformBrandFooter";';
const mode = process.argv[2];
if (!["--check", "--apply"].includes(mode)) {
  console.error("Uso: node scripts/install-order-system-brand-v61.cjs --check|--apply");
  process.exit(1);
}
const pathAt = rel => path.join(root, rel);
function read(rel) { return fs.readFileSync(pathAt(rel), "utf8"); }
function exists(rel) { return fs.existsSync(pathAt(rel)); }
function assert(cond, why) { if (!cond) throw new Error(why); }
function updateLayout(s) {
  if (s.includes(footerJSX)) {
    assert(s.includes(footerImport), "O rodapé está presente, mas seu import está faltando: confira app/layout.tsx.");
    return s;
  }
  assert(s.includes(layoutAnchor), `Não localizei o encaixe esperado em ${layoutDestination}; não editei o arquivo.`);
  assert(s.includes('import "./globals.css";'), "Não localizei o import de globals.css em app/layout.tsx.");
  assert(!s.includes(footerImport), "O import do rodapé já existe, mas o componente não está renderizado.");
  return s.replace('import "./globals.css";', `${footerImport}\nimport "./globals.css";`)
          .replace(layoutAnchor, `${layoutAnchor}\n            ${footerJSX}`);
}
function updateLoginBrand(s) {
  // A arte escolhida já contém o texto “Order System”. Evitar um segundo nome logo abaixo.
  if (!s.includes("<PlatformLoginBrand") && !s.includes("PLATFORM_LOGO_PATH")) return s;
  let result = s;
  if (result.includes("{PLATFORM_NAME}")) {
    const span = /\s*<span className="text-xs font-black uppercase tracking-\[0\.22em\] text-neutral-600 dark:text-neutral-300">\s*\{PLATFORM_NAME\}\s*<\/span>/;
    assert(span.test(result), "O cabeçalho de login foi personalizado; não foi possível remover texto duplicado com segurança.");
    result = result.replace(span, "")
          .replace('import { PLATFORM_LOGO_PATH, PLATFORM_NAME } from "@/app/lib/platform-brand";',
                   'import { PLATFORM_LOGO_PATH } from "@/app/lib/platform-brand";');
  }
  // Ícone inclui texto: deixá-lo um pouco maior e com nome acessível a leitores de tela.
  result = result.replace('alt=""\n        width={80}\n        height={80}\n        aria-hidden="true"\n        className="h-20 w-20 rounded-2xl object-cover shadow-sm"',
                          'alt="Order System"\n        width={96}\n        height={96}\n        className="h-24 w-24 rounded-2xl object-cover shadow-sm"');
  return result;
}

function preflight() {
  assert(exists("package.json"), "Execute na raiz de yamada-landing (pasta com package.json).");
  for (const rel of [layoutDestination, loginBrandDestination, footerSource, ...manifestDestinations])
    assert(exists(rel), `Arquivo ausente: ${rel}. Aplique primeiro a identidade v6.0 se não existir PlatformLoginBrand.tsx.`);
  for (const [src] of copyMap)
    assert(exists(`${source}/${src}`), `Falta imagem do pacote: ${source}/${src}`);
  const brand = "app/lib/platform-brand.ts";
  assert(exists(brand) && read(brand).includes('PLATFORM_LOGO_PATH = "/platform-logo.png"'),
    "Identidade v6.0 não identificada em app/lib/platform-brand.ts. Aplique v6.0 antes de v6.1.");
  for (const rel of manifestDestinations) {
    const m = JSON.parse(read(rel));
    assert(m.name === "Order System", `O manifesto ${rel} ainda não está com a marca Order System. Aplique a v6.0 primeiro.`);
    assert(m.icons?.some(i => i.sizes === "192x192" && i.src === "/icon-192x192.png"), `Manifesto ${rel} precisa do ícone 192x192.`);
    assert(m.icons?.some(i => i.sizes === "512x512" && i.src === "/icon-512x512.png"), `Manifesto ${rel} precisa do ícone 512x512.`);
  }
  const layout = updateLayout(read(layoutDestination));
  const brandSrc = updateLoginBrand(read(loginBrandDestination));
  return { layout, brandSrc };
}
function backingUp(rel, backupDir) {
  const sourceFile = pathAt(rel);
  if (!fs.existsSync(sourceFile)) return;
  const dst = path.join(backupDir, rel);
  fs.mkdirSync(path.dirname(dst), {recursive:true});
  fs.copyFileSync(sourceFile, dst);
}
function put(rel, buffer) {
  const dest = pathAt(rel);
  fs.mkdirSync(path.dirname(dest), { recursive:true });
  fs.writeFileSync(dest, buffer);
}
try {
  const edits = preflight();
  if (mode === "--check") {
    console.log("✓ Projeto identificado (Order System v6.0)");
    console.log("✓ Layout global pode receber rodapé sem alterar as rotas");
    console.log("✓ Imagens do ícone e rodapé encontradas");
    console.log("✓ Manifestos PWA compatíveis");
    console.log("✓ Componente compartilhado do login pode ser mantido sem texto duplicado");
    console.log("✓ Verificação concluída. Nenhum arquivo foi modificado.");
    process.exit(0);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(os.homedir(),"Downloads",`OrderSystem-Backup-antes-v61-${stamp}`);
  const targets = [layoutDestination, loginBrandDestination, footerDestination, ...copyMap.map(([,dst])=>dst)];
  for (const rel of new Set(targets)) backingUp(rel, backupDir);
  put(layoutDestination,Buffer.from(edits.layout));
  put(loginBrandDestination,Buffer.from(edits.brandSrc));
  put(footerDestination,fs.readFileSync(pathAt(footerSource)));
  for (const [src,dst] of copyMap) put(dst,fs.readFileSync(pathAt(`${source}/${src}`)));
  console.log("✓ Ícone aprovado aplicado à plataforma e ao PWA (192/512, maskable, iPhone e favicon)");
  console.log("✓ Rodapé horizontal centralizado em todas as rotas (sem cobrir a navegação móvel)");
  console.log("✓ Marca de cada seller preservada no catálogo, nos eventos e nos pedidos");
  console.log("✓ Lógica de autenticação, banco e pontos não foi modificada");
  console.log(`✓ Backup dos arquivos originais: ${backupDir}`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
}
