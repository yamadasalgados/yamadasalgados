/* Static alignment checks, not a replacement for Firebase Emulator/production tests. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = (p) => fs.readFileSync(p,'utf8');
const rules = read('firestore.rules.v5.review');
const ref = read('app/api/customer/referrals/route.ts');
const status = read('app/lib/referral-rewards-server.ts');
const session = read('app/api/customer/session/route.ts');
const orders = read('app/api/orders/create/route.ts');
const pub = read('app/api/public/referral-campaign/route.ts');
const checks = [
 ['customers inacessível ao SDK', /match \/customers\/\{document=\*\*\}\s*\{\s*allow read, write: if false/.test(rules)],
 ['códigos de convite inacessíveis ao SDK', /match \/referralCodes\/\{code\}\s*\{\s*allow read, write: if false/.test(rules)],
 ['seller não pode alterar configuração de campanha via SDK', rules.includes('settingId != "referralCampaign"')],
 ['loja exige assinatura e onboarding no referral', ref.includes('availableSeller(seller)') && ref.includes('accessIsActive')],
 ['referrer e convidado têm role de cliente', ref.includes('customerRoleAllowed(inviterRole)') && ref.includes('customerRoleAllowed(inviteeRole)')],
 ['payout revalida status dos dois participantes', status.includes('inviteeCustomer.data()?.accountStatus !== "active"') && status.includes('inviterCustomer.data()?.accountStatus !== "active"')],
 ['payout bloqueia role de seller/admin', status.includes('!allowedRole(inviterRole) || !allowedRole(inviteeRole)')],
 ['sessão não reativa contas suspensas', session.includes('current.accountStatus === "suspended"')],
 ['API pedido não reativa contas suspensas', orders.includes('customerSnapshot.data()?.accountStatus === "suspended"')],
 ['banner público exige loja operacional', pub.includes('operational && sellerReferralAccepting(doc.data(), Date.now())')],
 ['transação grava bônus idempotentes', status.includes('referral_welcome_') && status.includes('tx.create(firstRef')],
];
checks.forEach(([name,pass])=>{assert.ok(pass,name);console.log(`✓ ${name}`)});
console.log(`${checks.length}/${checks.length} checagens estáticas de endurecimento aprovadas.`);
