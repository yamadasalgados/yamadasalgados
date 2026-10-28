#!/usr/bin/env node
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const base = process.cwd();
const file = p => fs.readFileSync(path.join(base,p),'utf8');
let passed=0;
function test(label,ok) { if (!ok) { console.error(`✗ ${label}`); process.exitCode=1; } else { console.log(`✓ ${label}`); passed++; } }
function size(rel){ const b=fs.readFileSync(path.join(base,rel)); return [b.readUInt32BE(16),b.readUInt32BE(20)]; }
const seller=file('app/login/page.tsx');
const customer=file('app/customer/login/page.tsx');
const roles=file('app/_components/RoleNavigation.tsx');
const platform=file('app/lib/platform-brand.ts');
const manifest=JSON.parse(file('public/manifest.webmanifest'));
const manifest2=JSON.parse(file('public/manifest.json'));
test('Vendedor apresenta marca institucional',seller.includes('<PlatformLoginBrand />'));
test('Cliente apresenta a mesma marca',customer.includes('<PlatformLoginBrand />'));
test('Login seller mantém autenticação original',seller.includes('signInWithEmailAndPassword')&&seller.includes('resolveAuthenticatedAccount'));
test('Login customer mantém cadastro e encaminhamento',customer.includes('createUserWithEmailAndPassword')&&customer.includes('resolveAuthenticatedAccount'));
test('Cliente consegue navegar ao login de seller',customer.includes('href="/login"')&&customer.includes('text.sellerAccess'));
test('Seller consegue navegar ao login de cliente',seller.includes('href="/customer/login"'));
test('Painel admin utiliza marca Order System',roles.includes('href="/admin" name={PLATFORM_NAME} logoUrl={PLATFORM_LOGO_PATH}'));
test('Painel seller utiliza marca Order System',roles.includes('href="/seller" name={PLATFORM_NAME} logoUrl={PLATFORM_LOGO_PATH}'));
test('Vitrine continua com identidade de cada seller',roles.includes('name={sellerIdentity.storeName || copy.store} logoUrl={sellerIdentity.logoUrl}'));
test('Nome público global neutro',platform.includes('"Order System"')&&!platform.includes('PLATFORM_NAME = "Yamada'));
test('Ícone global de 192px',size('public/icon-192x192.png').join('x')==='192x192');
test('Ícone global de 512px',size('public/icon-512x512.png').join('x')==='512x512');
test('Ícone maskable de 512px',size('public/icon-maskable-512x512.png').join('x')==='512x512');
test('Manifestos globais neutros',manifest.name==='Order System'&&manifest2.name==='Order System');
test('PWA oferece ícone maskable',manifest.icons.some(i=>i.purpose==='maskable'&&i.src==='/icon-maskable-512x512.png'));
test('SVG editável disponível',file('public/platform-logo.svg').includes('viewBox="0 0 256 256"'));
if(process.exitCode)console.error(`Auditoria encontrou inconsistências (${passed}/16).`);
else console.log(`${passed}/16 verificações de identidade aprovadas.`);
