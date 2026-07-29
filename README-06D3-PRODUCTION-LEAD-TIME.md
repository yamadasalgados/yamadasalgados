# 06D3 — Prazo individual de produção por produto

Esta etapa adiciona um prazo de produção configurável a cada produto e usa esse prazo na loja permanente, nos eventos e na criação autoritativa do pedido.

## Estrutura salva no produto

```ts
productionLeadTime: {
  days: 3,
  unit: "calendar_days"
},
productionLeadTimeDays: 3
```

O campo plano `productionLeadTimeDays` foi mantido como compatibilidade e facilidade de consulta. O objeto `productionLeadTime` é a estrutura canônica.

## Regras

- Produtos normais aceitam prazo entre `0` e `365` dias corridos.
- Produtos sob encomenda e kits configuráveis exigem no mínimo `1` dia.
- Produtos antigos sob encomenda sem prazo configurado recebem fallback seguro de `1` dia.
- Quando a quantidade solicitada ultrapassa o estoque e o seller aceita pedidos sem estoque, o prazo do produto também é aplicado.
- Em carrinhos com vários produtos, vale o maior prazo entre os itens que realmente precisam de produção.
- O cálculo respeita o fuso horário do seller.

## Experiência do seller

Em `/seller/products`, ao criar ou editar um produto, existe o bloco **Prazo de produção**.

O card do produto também mostra o prazo salvo, facilitando a conferência sem abrir o modal.

## Experiência do cliente

### Loja permanente

- Produtos sob encomenda mostram o prazo real.
- Produtos que precisam de reposição mostram o prazo quando a quantidade supera o estoque.
- O carrinho calcula a primeira data disponível.
- O campo de data não aceita datas anteriores ao prazo calculado.
- Caso o carrinho mude, uma data que deixou de ser válida é removida.

### Eventos

- Produtos sob encomenda e itens sujeitos à produção mostram o prazo real.
- Datas do evento anteriores ao prazo ficam desabilitadas.
- O formulário seleciona somente datas elegíveis.
- Quando não existe data elegível, permanece disponível a opção “a combinar”, conforme o comportamento anterior do evento.

## Validação no servidor

A rota `POST /api/orders/create` recalcula tudo usando o catálogo atual:

- necessidade real de produção;
- maior prazo do pedido;
- primeira data possível;
- fuso horário do seller;
- validade da data enviada pelo cliente.

Uma tentativa com data anterior retorna:

```text
FULFILLMENT_DATE_UNAVAILABLE
```

Datas malformadas também são rejeitadas.

## Snapshot salvo no pedido

Cada item recebe:

```ts
productionLeadTime: { days, unit: "calendar_days" }
productionLeadTimeDays: number
productionScheduleApplied: boolean
earliestFulfillmentDate: "YYYY-MM-DD"
```

O pedido recebe:

```ts
productionSchedule: {
  schemaVersion: 1,
  timeZone: string,
  maxLeadTimeDays: number,
  earliestFulfillmentDate: "YYYY-MM-DD",
  productIds: string[],
  productionRequired: boolean,
  calculatedAt: Timestamp
}
```

Isso preserva o prazo efetivamente usado mesmo que o produto seja alterado depois.

## Instalação do patch

Na raiz do projeto:

```bash
unzip -o yamada-06D3-production-lead-time.zip -d .
rm -rf .next
npm run build
```

Não houve alteração nas Firestore Rules nem nas Cloud Functions. Depois do build, publique normalmente na Vercel.

## Checklist rápido

1. Edite um produto sob encomenda e defina prazo de 3 dias.
2. Abra a loja e confirme o aviso de 3 dias.
3. Adicione outro produto com prazo de 5 dias e falta de estoque.
4. Confirme que o carrinho usa 5 dias como prazo máximo.
5. Tente escolher uma data anterior e confirme o bloqueio.
6. Finalize um pedido e confira `productionSchedule` no Firestore.
