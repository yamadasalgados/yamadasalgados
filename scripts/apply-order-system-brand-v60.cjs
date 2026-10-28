#!/usr/bin/env node
"use strict";

// Migração visual/identidade; deliberadamente não toca autenticação, roles,
// Firestore, Firebase Functions, pontos, rotas de redirecionamento nem lojas.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = process.cwd();
const packageDir = path.join(root, "branding-v60");
const apply = process.argv.includes("--apply");
const check = process.argv.includes("--check") || !apply;
if (!fs.existsSync(path.join(root, "package.json"))) {
  throw new Error("Execute na raiz do projeto (onde está package.json).");
}

const replacements = [];
const errors = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { errors.push(`Arquivo ausente: ${rel}`); return null; }
  return fs.readFileSync(file, "utf8");
}
function sourceFile(rel) {
  const source = path.join(packageDir, rel);
  if (!fs.existsSync(source)) { errors.push(`Arquivo do pacote ausente: branding-v60/${rel}`); return null; }
  return fs.readFileSync(source);
}
function addText(rel, nextText) {
  const current = read(rel);
  if (current === null) return;
  if (current === nextText) return;
  replacements.push({ rel, data: Buffer.from(nextText) });
}
function replaceExact(input, needle, replacement, label) {
  if (!input.includes(needle)) {
    errors.push(`Marca esperada não encontrada: ${label}. Projeto pode ter sido alterado; nenhuma substituição parcial será feita.`);
    return input;
  }
  return input.replace(needle, replacement);
}

let seller = read("app/login/page.tsx");
if (seller != null && !seller.includes("<PlatformLoginBrand />")) {
  // Controle de segurança: a transformação não deve tocar funções de login ou rotas.
  const logoBlock = /<div className="h-20 w-20 overflow-hidden rounded-2xl bg-neutral-100 shadow-sm dark:bg-neutral-800">\s*\{\/\* eslint-disable-next-line @next\/next\/no-img-element \*\/\}\s*<img src=\{PLATFORM_LOGO_PATH\} alt=\{PLATFORM_NAME\} className="h-full w-full object-cover" \/>\s*<\/div>/;
  if (!logoBlock.test(seller)) errors.push("Cabeçalho do vendedor não corresponde à versão esperada.");
  else seller = seller.replace(logoBlock, "<PlatformLoginBrand />");
  seller = replaceExact(seller, 'import { AppearanceButtons } from "@/app/_components/RoleNavigation";', 'import { AppearanceButtons } from "@/app/_components/RoleNavigation";\nimport PlatformLoginBrand from "@/app/_components/PlatformLoginBrand";', "importação seller");
  seller = seller.replace(/^import \{ PLATFORM_LOGO_PATH, PLATFORM_NAME \} from "@\/app\/lib\/platform-brand";\n/m, "");
  seller = seller.replace('className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8"', 'className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8"');
  seller = seller.replace('<h1 className="mt-5 text-2xl font-black tracking-tight">', '<h1 className="mt-5 text-2xl font-black tracking-tight">');
  if (!seller.includes("<PlatformLoginBrand />")) errors.push("Falha ao inserir marca no vendedor");
  addText("app/login/page.tsx", seller);
}

let customer = read("app/customer/login/page.tsx");
if (customer != null && !customer.includes("<PlatformLoginBrand />")) {
  customer = replaceExact(customer,
    'import { AppearanceButtons } from "@/app/_components/RoleNavigation";',
    'import { AppearanceButtons } from "@/app/_components/RoleNavigation";\nimport PlatformLoginBrand from "@/app/_components/PlatformLoginBrand";',
    "importação customer");
  // Mesmo cartão, tipografia e local da alternância customer/seller.
  customer = customer.replace('className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:p-8"', 'className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8"');
  const linkPattern = /\s*<Link href="\/login" className="mb-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-bold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">\s*<Store size=\{17\} \/>\{text\.sellerAccess\}\s*<\/Link>/;
  if (!linkPattern.test(customer)) errors.push("Link de alternância do login customer não encontrado.");
  else customer = customer.replace(linkPattern, "");
  const heading = '<h1 className="text-2xl font-black tracking-tight">{text.title}</h1>';
  customer = replaceExact(customer, heading,
    '<PlatformLoginBrand />\n          <h1 className="mt-5 text-2xl font-black tracking-tight">{text.title}</h1>',
    "marca no título customer");
  const closeHeading = '<p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">{text.benefit}</p>\n        </div>';
  customer = replaceExact(customer, closeHeading,
    closeHeading + '\n        <Link href="/login" className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-bold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">\n          <Store size={17} />{text.sellerAccess}\n        </Link>',
    "reposicionar link de vendedor");
  addText("app/customer/login/page.tsx", customer);
}

// Painel de gestão pertence à plataforma; a vitrine continua usando a marca de cada seller.
let navigation = read("app/_components/RoleNavigation.tsx");
if (navigation && navigation.includes('<Brand label={copy.seller} href="/seller" name={displayName || copy.seller} logoUrl={logoUrl} primaryColor={primaryColor} />')) {
  navigation = navigation.replace(
    '<Brand label={copy.seller} href="/seller" name={displayName || copy.seller} logoUrl={logoUrl} primaryColor={primaryColor} />',
    '<Brand label={displayName || copy.seller} href="/seller" name={PLATFORM_NAME} logoUrl={PLATFORM_LOGO_PATH} />'
  );
  // Conservar as props aceitas por layouts legados, mas não usá-las para a identidade global.
  navigation = navigation.replace(
    'export function SellerNav({ displayName = "", sellerId = "", logoUrl = "", primaryColor = "#f97316" }: { displayName?: string; sellerId?: string; logoUrl?: string; primaryColor?: string })',
    'export function SellerNav({ displayName = "", sellerId = "" }: { displayName?: string; sellerId?: string; logoUrl?: string; primaryColor?: string })'
  );
  addText("app/_components/RoleNavigation.tsx", navigation);
} else if (navigation && !navigation.includes('<Brand label={displayName || copy.seller} href="/seller" name={PLATFORM_NAME} logoUrl={PLATFORM_LOGO_PATH} />')) {
  errors.push("SellerNav divergiu da versão revisada: é necessário verificar o trecho antes de modificar o branding do painel.");
}

const brandSource = sourceFile("components/PlatformLoginBrand.tsx");
if (brandSource) replacements.push({rel:"app/_components/PlatformLoginBrand.tsx",data:brandSource});

// Validar que o nome público é neutro e que a vitrine usa marca do seller.
const platformBrand = read("app/lib/platform-brand.ts");
if (platformBrand && (!platformBrand.includes('"Order System"') || !platformBrand.includes('PLATFORM_LOGO_PATH = "/platform-logo.png"'))) {
  errors.push("Configuração de branding encontrada é diferente; não sobrescrever automaticamente.");
}

for (const n of ["platform-logo.svg", "platform-logo.png", "icon-192x192.png", "icon-512x512.png", "icon-maskable-512x512.png", "apple-touch-icon.png", "notification-badge.png"]) {
  const b = sourceFile(`assets/${n}`);
  if (b) replacements.push({ rel:`public/${n}`, data:b });
}
const ico=sourceFile("assets/favicon.ico");
if (ico) replacements.push({rel:"app/favicon.ico",data:ico});

for (const rel of ["public/manifest.json", "public/manifest.webmanifest"]) {
  const old = read(rel);
  if (old === null) continue;
  try {
    const doc = JSON.parse(old);
    if (doc.name !== "Order System" && doc.name !== "OrderSystem") errors.push(`${rel}: nome de PWA inesperado (${doc.name}); revise manualmente.`);
    else {
      doc.icons = [
        { src:"/icon-192x192.png", sizes:"192x192", type:"image/png", purpose:"any" },
        { src:"/icon-512x512.png", sizes:"512x512", type:"image/png", purpose:"any" },
        { src:"/icon-maskable-512x512.png", sizes:"512x512", type:"image/png", purpose:"maskable" }
      ];
      addText(rel,JSON.stringify(doc,null,2)+"\n");
    }
  } catch (e) { errors.push(`${rel}: JSON inválido: ${e.message}`); }
}
let layout=read("app/layout.tsx");
if (layout && layout.includes('apple: "/icon-192x192.png"')) {
  addText("app/layout.tsx",layout.replace('apple: "/icon-192x192.png"','apple: "/apple-touch-icon.png"'));
}

if (errors.length) {
  console.error("\nNÃO APLICADO. Ajustes necessários:\n" + errors.map(v => "- " + v).join("\n"));
  process.exit(1);
}
const unique = new Map(replacements.map(item => [item.rel,item.data]));
const changed = [...unique].filter(([rel,b])=>{
  const p=path.join(root,rel);
  return !fs.existsSync(p)||!fs.readFileSync(p).equals(b);
});
console.log(`Identidade Order System v6.0: ${changed.length} arquivo(s) para atualizar.`);
changed.forEach(([rel]) => console.log(`  ${rel}`));
if (check) { console.log("Pré-verificação OK. Rode com --apply para aplicar."); process.exit(0); }

const backup = path.join(os.homedir(),"Downloads",`OrderSystem-Backup-antes-v6-${new Date().toISOString().replace(/[:.]/g,"-")}`);
fs.mkdirSync(backup,{recursive:true,mode:0o700});
for (const [rel] of changed) {
  const target=path.join(root,rel);
  if (fs.existsSync(target)) {
    const dest=path.join(backup,rel); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(target,dest);
  }
}
for (const [rel,data] of changed) {
  const target=path.join(root,rel);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,data);
}
console.log(`Aplicado. Backups dos arquivos substituídos: ${backup}`);
console.log("Não alteramos roles, Firebase, pedidos, pontos, produtos ou marcas de sellers.");
