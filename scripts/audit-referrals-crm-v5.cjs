const fs = require("node:fs");
const checks = [
  ["Corrige type OrderErrorCode", "app/api/orders/create/route.ts", /\| "ACCOUNT_DISABLED"/],
  ["Limite de indicações controlado no backend", "app/api/customer/referrals/route.ts", /Math\.max\(reservedCount, creditedCount\) >= maxSlots/],
  ["Limite de indicações na transação", "app/api/customer/referrals/route.ts", /tx.set\(counterRef/],
  ["Bônus automático só ao entregar", "app/api/orders/status/route.ts", /prepareFirstDeliveryReferral/],
  ["Pontos por loja", "app/lib/referral-rewards-server.ts", /collection\("rewardWallets"\).doc\(sellerId\)/],
  ["Tela de prazo e limite", "app/seller/settings/referrals/page.tsx", /maxRewardsPerInviter/],
  ["Botão de compartilhamento nativo", "app/_components/ReferralCampaignBanner.tsx", /navigator.share/],
  ["Consentimento explícito de marketing", "app/api/customer/marketing-preferences/route.ts", /consentSource/],
  ["Preferências separadas de status push", "app/api/customer/marketing-preferences/route.ts", /Never infer marketing consent/],
  ["Dados de compras entregues", "app/api/orders/status/route.ts", /prepareCustomerInterest/],
  ["Isolamento de tenant", "app/lib/customer-interests-server.ts", /collection\("customerInsights"\)/],
  ["Audience baseada em histórico", "functions/src/notifications.ts", /where\("interestKeys", "array-contains", interestKey\)/],
  ["Consentimento verificado no envio", "functions/src/notifications.ts", /preference.data\(\)\?\.enabled !== true/],
  ["Campanhas rate-limited", "app/api/seller/marketing-campaigns/route.ts", /86_400_000/],
  ["Campanha sem URLs arbitrárias", "functions/src/notifications.ts", /url: `\/store\/\$\{encodeURIComponent\(sellerId\)\}`/],
  ["Regras v5 bloqueiam escrita CRM", "firestore.rules.v5.review", /match \/customerInsights\/\{customerUid\}/],
  ["Regras v5 bloqueiam marketingThrottle", "firestore.rules.v5.review", /settingId != "marketingThrottle"/],
];
let failed=0;
for (const [name, file, pattern] of checks) {
  const ok = pattern.test(fs.readFileSync(file, "utf8"));
  console.log(`${ok ? "✓" : "✗"} ${name}`); if (!ok) failed++;
}
console.log(`${checks.length-failed}/${checks.length} verificações estruturais aprovadas.`);
if (failed) process.exitCode=1;
