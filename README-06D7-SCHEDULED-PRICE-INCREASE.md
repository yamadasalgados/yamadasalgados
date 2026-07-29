# 06D7 — Preços programados e avisos comerciais

Esta etapa adiciona aumento de preço programado por produto, com aviso ao cliente antes da vigência e aplicação automática do novo valor no checkout.

## Configuração no produto

Em `/seller/products`, ao criar ou editar um produto, o seller pode informar:

- ativar ou desativar o aumento programado;
- novo preço;
- data e hora de vigência;
- mensagem opcional para o cliente;
- exibição opcional da contagem regressiva.

A data é interpretada no fuso horário configurado para o seller.

## Comportamento público

Antes da data:

- o preço atual continua válido;
- o card recebe destaque de aumento próximo;
- o novo preço e a data são apresentados;
- a mensagem comercial e a contagem regressiva podem ser mostradas.

A partir da data:

- loja, evento, carrinho e checkout usam automaticamente o novo preço;
- o preço anterior pode aparecer riscado;
- não é necessário alterar manualmente o campo principal no momento exato da virada.

O preço-base permanece salvo no documento do produto para auditoria e edição. O valor efetivo é calculado usando `scheduledPriceChange`.

## Validação autoritativa

`POST /api/orders/create` recalcula o preço de cada produto usando o relógio do servidor. O navegador envia um snapshot dos preços vistos pelo cliente.

Quando o preço muda durante a finalização, a API responde com:

```text
PRICE_CHANGED
```

O cliente recebe uma mensagem para revisar o carrinho e tentar novamente. Isso impede pedidos concluídos com um preço antigo após a data programada.

## Estrutura salva no produto

```ts
scheduledPriceChange: {
  enabled: true,
  nextPriceMinor: 600,
  startsAt: Timestamp,
  startsAtMillis: 1786327200000,
  message: "Aproveite o preço atual antes do aumento.",
  showCountdown: true
},
priceScheduleVersion: 1
```

`priceMinor` continua representando o preço-base. A loja e o servidor calculam o preço efetivo de forma automática.

## Snapshot no pedido

Cada item do pedido preserva:

- preço-base;
- preço efetivamente cobrado;
- origem do preço;
- estado da programação;
- novo preço e data programada;
- mensagem vigente.

O pedido também salva `pricingSchedule`, com o horário da avaliação e os produtos que tiveram o aumento aplicado.

## Instalação

Na raiz do projeto:

```bash
git add -A
git commit -m "checkpoint antes da 06D7"

unzip -o yamada-06D7-scheduled-price-increase.zip -d .

npm install
npm run audit:white-label
rm -rf .next
npm run build
```

Depois, publique normalmente na Vercel.

Esta etapa não altera Firestore Rules, Storage Rules nem Cloud Functions.
