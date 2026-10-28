import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const checks = [
  ['Login seller oferece caminho para customer', 'app/login/page.tsx', ['href="/customer/login"', 'copy.customerAccess']],
  ['Login customer oferece caminho para seller', 'app/customer/login/page.tsx', ['href="/login"', 'text.sellerAccess']],
  ['Login customer resolve roles', 'app/customer/login/page.tsx', ['resolveAuthenticatedAccount', 'resolved.role === "admin" || resolved.role === "seller"']],
  ['Loja reconhece seller e admin', 'app/_components/RoleNavigation.tsx', ['businessDestination', 'session.accountRole === "seller"', 'session.accountRole === "admin"']],
  ['Loja oferece acesso ao painel', 'app/_components/RoleNavigation.tsx', ['href={businessDestination}', 'copy.dashboard']],
  ['Customer session identifica role antes de criar perfil', 'app/hooks/useCustomerSession.ts', ['await resolveAuthenticatedAccount(nextUser)', 'resolved.role === "admin" || resolved.role === "seller"', 'await loadProfile(nextUser)']],
  ['Servidor nunca cria customer profile para seller', 'app/api/customer/session/route.ts', ['transaction.get(db.collection("users").doc(decoded.uid))', 'identity.data()?.role === "seller"', 'transaction.create(reference']],
  ['Cliente nao acessa o painel seller sem role', 'app/_components/SellerGuard.tsx', ['await resolveAuthenticatedAccount(user)', 'resolved.role === "customer"', 'router.replace("/customer/orders")']],
  ['Rotas customer corrigem conta seller', 'app/customer/layout.tsx', ['session.accountRole === "seller"', 'router.replace(destination)']],
  ['Banner nao premia vendedores', 'app/_components/ReferralCampaignBanner.tsx', ['businessAccount', 'session.loading || businessAccount']],
  ['Verificacao de email explicada no banner', 'app/_components/ReferralCampaignBanner.tsx', ['text.verifyHelp', 'sendEmailVerification(auth.currentUser)', 'await reload(auth.currentUser)']],
  ['Endpoint de indicacao rejeita login de seller', 'app/api/customer/referrals/route.ts', ['customerRoleAllowed(identity)', 'requireVerified(user)']],
  ['Carteira nao se mostra para vendedor', 'app/api/customer/rewards/route.ts', ['identity.data()?.role === "seller"']],
  ['Marketing nao aceita vendedor por engano', 'app/api/customer/marketing-preferences/route.ts', ['identity.data()?.role === "seller"']],
  ['Vendedor compartilha loja, sem credito de indicacao', 'app/seller/settings/referrals/page.tsx', ['navigator.share', 'storeLink', 'bônus de 100 pontos']],
];
let passed=0;
for (const [label, file, needles] of checks) {
  const src=read(file);
  for (const needle of needles) assert(src.includes(needle), `${label}: faltou ${needle}`);
  console.log('✓', label);
  passed++;
}
console.log(`${passed}/${checks.length} verificacoes estruturais de acesso aprovadas. Ainda requer build e testes com Firebase.`);
