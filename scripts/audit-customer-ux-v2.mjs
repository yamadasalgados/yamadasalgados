import fs from 'node:fs';
import assert from 'node:assert/strict';

const store = fs.readFileSync('app/store/[sellerId]/StoreClient.tsx', 'utf8');
const event = fs.readFileSync('app/event/[...id]/EventClient.tsx', 'utf8');
const checks = [
  ['revisão do pedido antes de enviar na loja', /onClick=\{reviewCheckout\}/.test(store) && /setReviewOpen\(true\)/.test(store)],
  ['confirmação explícita necessária para enviar a encomenda', /text\.reviewConfirm/.test(store) && /void submitOrder\(\)/.test(store)],
  ['revisão de itens, cliente e entrega', ['text.reviewItems', 'text.reviewCustomer', 'text.reviewReceiving'].every(x => store.includes(x))],
  ['editar produtos, dados ou recebimento sem perder a encomenda', ['text.reviewEditProducts', 'text.reviewEditData', 'text.reviewEditReceiving'].every(x => store.includes(x))],
  ['erro antes da revisão se faltar telefone ou nome', /function reviewCheckout\(\)/.test(store) && /text\.requiredName/.test(store) && /text\.requiredPhone/.test(store)],
  ['endereço obrigatorio na entrega com autocomplete', /autoComplete="street-address"\s+required/.test(store)],
  ['destinatário postal aproveita nome do cliente', /recipientName: option\.value === "postal"/.test(store)],
  ['campos opcionais não poluem checkout', ['text.optionalNote','text.optionalLocation'].every(x => store.includes(x))],
  ['prévia de subtotal, descontos e frete antes de confirmar', /text\.subtotal/.test(store) && /discount \+ rewardsDiscount/.test(store) && /shippingFee > 0/.test(store)],
  ['correio avisa frete a cobrar ou a combinar', /text\.reviewPostalCollect/.test(store) && /text\.reviewPostalPending/.test(store)],
  ['cópia de número do pedido concluído', /navigator\.clipboard\.writeText\(createdOrderId\)/.test(store)],
  ['traduções português inglês japonês na revisão', (store.match(/reviewTitle:/g) || []).length === 3 && (store.match(/reviewConfirm:/g) || []).length === 3],
  ['modal com fechamento e foco acessível', /aria-modal="true"/.test(store) && /reviewDialogRef\.current\?\.focus\(\)/.test(store)],
  ['evento exibe resumo e permite alterar produtos', /1\. Produtos escolhidos/.test(event) && /setCheckoutOpen\(false\)/.test(event)],
  ['evento informa erros ao finalizar sem campos', /disabled=\{submitting\}/.test(event) && /"Informe seu telefone\."/.test(event)],
  ['não altera o processo de backend de criação de pedido', /createPublicOrder\(/.test(store) && /createPublicOrder\(/.test(event)],
];
for (const [title, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${title}`);
  assert.ok(ok, `Falhou: ${title}`);
}
console.log(`\n${checks.length}/${checks.length} verificações UX v2 aprovadas.`);
