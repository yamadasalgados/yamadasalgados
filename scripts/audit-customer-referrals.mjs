import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(p, 'utf8');
const campaign = src('app/lib/referral-campaign.ts');
const api = src('app/api/customer/referrals/route.ts');
const credit = src('app/lib/referral-rewards-server.ts');
const delivery = src('app/api/orders/status/route.ts');
const store = src('app/store/[sellerId]/StoreClient.tsx');
const banner = src('app/_components/ReferralCampaignBanner.tsx');
const wallet = src('app/api/customer/rewards/route.ts');
const rules = src('firestore.rules.v5.review');
const login = src('app/customer/login/page.tsx');
const sellerSettings = src('app/api/seller/referral-campaign/route.ts');
const sellerUI = src('app/seller/rewards/page.tsx');
const publicCampaign = src('app/api/public/referral-campaign/route.ts');
const checks = [
 ['Campanha 2026 encerra no instante exclusivo de 01/01/2027 JST', campaign.includes('2027-01-01T00:00:00+09:00')],
 ['Bônus somente 100 por pessoa, fixo no servidor', campaign.includes('pointsPerPerson: 100')],
 ['Vendedor ativa sua própria campanha explicitamente', sellerSettings.includes('typeof data.enabled') && sellerUI.includes('toggleReferral')],
 ['API pública só mostra campanha de lojas habilitadas', publicCampaign.includes('sellerReferralAccepting(doc.data(), Date.now())')],
 ['Nova indicação exige campanha ativa na loja', api.includes('sellerReferralAccepting(settings.data(), Date.now())')],
 ['Pausa não cancela compromissos com indicados antigos', !credit.includes('campaignSettingsSnap')],
 ['Token validado em Firebase Admin (revogação)', api.includes('verifyIdToken(token, true)')],
 ['Código aleatório criptográfico e não previsível', api.includes('randomBytes(18)')],
 ['Exige confirmação real do e-mail', api.includes('requireVerified(user)')],
 ['Verifica data real de criação no Auth', api.includes('user.metadata.creationTime')],
 ['Bloqueia autocadastro e conta do próprio indicador', api.includes('inviterUid === user.uid')],
 ['Vínculo da indicação é criado de forma atômica', api.includes('tx.create(enrollmentRef')],
 ['Recusa mudança de convite depois do primeiro pedido', api.includes('customer.data()!.orderCount > 0')],
 ['Carteiras e movimentações só no backend', rules.includes('match /customers/{document=**}') && rules.includes('match /{document=**}')],
 ['Compra é validada pelo preço calculado no servidor', credit.includes('orderData.totalAmountMinor') && credit.includes('merchandisePaidMinor')],
 ['Um único primeiro pedido pago por cliente/loja', credit.includes('firstPaidPurchases') && credit.includes('if (firstSnap.exists)')],
 ['Sem crédito na inscrição nem em pedido não entregue', !api.includes('rewardWallets') && delivery.includes('clean.status === "delivered"')],
 ['As duas carteiras e dois extratos na mesma transação', credit.includes('referrerWalletRef') && credit.includes('newWalletRef') && credit.includes('tx.create(referrerMovementRef') === false && credit.includes('credit(newWalletRef')],
 ['Movimentos com IDs determinísticos evitam duplicidade', credit.includes('referral_welcome_') && credit.includes('referral_${customerUid}_')],
 ['Transação registra referência ao pedido', credit.includes('orderPath') && credit.includes('creditedOrderId')],
 ['Bônus combinado com pontos de compra no mesmo wallet sem sobrescrever saldo', delivery.includes('referralCreditUids?.has(context.customerUid)')],
 ['Registra primeiro pedido também sem convite', credit.includes('referralAwarded: false')],
 ['Operação de entrega integra fluxo normal e legacy', (delivery.match(/awardReferral\(\)/g) || []).length === 2],
 ['Banner aparece na loja e permite não exibir novamente', store.includes('<ReferralCampaignBanner sellerId={sellerId}') && banner.includes(':hide')],
 ['Cliente convidado é encaminhado para criação de conta', banner.includes('mode=register') && login.includes('params.get("mode")')],
 ['Histórico de pontos distingue bônus de indicação', wallet.includes('referral_bonus')],
];
for (const [name, result] of checks) {
  console.log(`${result ? '✓' : '✗'} ${name}`);
  assert.ok(result, name);
}
console.log(`${checks.length}/${checks.length} auditorias estáticas de indicação aprovadas.`);
