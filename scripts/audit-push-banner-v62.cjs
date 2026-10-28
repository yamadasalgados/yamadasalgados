const fs = require('node:fs');
const path = require('node:path');

const files = [
  'app/_components/CustomerPushNotifications.tsx',
  'app/_components/SellerPushNotifications.tsx',
];
let checked = 0;
function verify(condition, label) {
  if (!condition) throw new Error(`FALHOU: ${label}`);
  console.log(`✓ ${label}`);
  checked += 1;
}

for (const file of files) {
  const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const section = file.includes('Customer') ? 'Cliente' : 'Seller';
  verify(!source.includes('fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]'), `${section}: aviso não sobrepõe o rodapé/menu`);
  verify(source.includes('mx-auto w-full max-w-lg shadow-lg'), `${section}: cartão no fluxo normal com largura limitada`);
  verify(source.includes('bg-white text-neutral-950 dark:') && source.includes('dark:bg-neutral-900 dark:text-white'), `${section}: fundo sólido no tema claro e escuro`);
  verify(source.includes('min-h-10 min-w-10'), `${section}: fechar aviso com alvo acessível`);
  verify(source.includes('promptOnce ? "w-full"'), `${section}: botão de ação na largura do cartão`);
  verify(source.includes('dismissPrompt') && source.includes('PROMPT_DISMISSED_KEY') === file.includes('Customer'), `${section}: fechamento persistente preservado`);
}
console.log(`${checked}/${checked} verificações de apresentação aprovadas.`);
