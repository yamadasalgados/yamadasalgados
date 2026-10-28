#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const assert=require('node:assert/strict');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function check(cond,label){assert.ok(cond,label);console.log('✓',label);}
const page=read('app/customer/stores/page.tsx');
const route=read('app/api/public/stores/search/route.ts');
const hook=read('app/hooks/useCustomerRewards.ts');
const nav=read('app/_components/RoleNavigation.tsx');
const create=read('app/api/orders/create/route.ts');
const rewards=read('app/api/customer/rewards/route.ts');
const referral=read('app/lib/referral-rewards-server.ts');
let count=0;
for(const [p,source] of [
  ['app/customer/stores/page.tsx',page],
  ['app/api/public/stores/search/route.ts',route],
  ['app/hooks/useCustomerRewards.ts',hook],
]){
  const ast=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,p.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  check(ast.parseDiagnostics.length===0,`Sintaxe TypeScript: ${p}`);count++;
}
const items=[
 [page.includes('/api/public/stores/search?q='),'Busca por nome via backend'],
 [page.includes('rememberCustomerStoreContext(session.user?.uid'),'Loja lembrada por UID'],
 [page.includes('/customer/stores')===false || page.includes('useCustomerSession'),'Tela de escolha autenticada'],
 [page.includes('controller.abort()'),'Busca cancelada ao mudar consulta'],
 [page.includes('text.points'),'Explicacao de pontos exclusivos por loja'],
 [nav.includes('{ href: "/customer/stores", label: copy.store'),'Menu Loja da conta abre o diretorio'],
 [route.includes('data.accountStatus !== "active"')&&route.includes('data.onboarding?.complete !== true'),'Somente lojas ativas e com onboarding completo'],
 [route.includes('publicSeller.available'),'Assinatura efetiva validada no backend'],
 [route.includes('.select(')&&!route.includes('ownerUid,'),'Backend nao retorna detalhes privados da conta'],
 [route.includes('SCAN_LIMIT = 300')&&route.includes('RESULT_LIMIT = 12'),'Resultados e leituras limitados'],
 [hook.includes('wallet?.sellerId === sellerId')&&hook.includes('requestVersion.current !== version'),'Hook impede pontos de loja anterior e respostas atrasadas'],
 [create.includes('customerRef.collection("rewardWallets").doc(clean.sellerId)'),'Compra utiliza somente carteira da loja do pedido'],
 [rewards.includes('customerRef.collection("rewardWallets").doc(sellerId)'),'Extrato busca carteira especifica da loja'],
 [referral.includes('collection("rewardWallets").doc(sellerId)'),'Indicações creditadas na carteira da loja'],
];
for(const [ok,label] of items){check(ok,label);count++;}
console.log(`${count}/${count} verificacoes locais aprovadas. Ainda e necessario testar Firebase/Vercel reais.`);
