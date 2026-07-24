# Catálogo 02B — ofertas, promoções e kits flexíveis

## Escopo

Este pacote adiciona o módulo de ofertas em:

```text
sellers/{sellerId}/offers/{offerId}
```

A versão 02B permite:

- preço total fixo;
- desconto fixo;
- desconto percentual;
- seleção de qualquer combinação entre produtos elegíveis;
- quantidade obrigatória por kit;
- vários kits completos da mesma oferta no mesmo carrinho;
- período opcional de início e término;
- ativação e desativação;
- conteúdo PT, EN e JA;
- snapshot da oferta dentro do pedido.

## Regra de aplicação

O cliente seleciona uma oferta ativa e adiciona produtos participantes.

Exemplo:

```text
Kit: 10 unidades por ¥1.000

Coxinha: 4
Kibe: 3
Risoles: 3
Total elegível: 10
```

A oferta é aplicada quando existe pelo menos um conjunto completo.

```text
10 itens elegíveis → 1 kit
20 itens elegíveis → 2 kits
25 itens elegíveis → 2 kits + 5 itens no preço normal
```

Nesta etapa, somente uma oferta pode ficar selecionada por pedido. Isso evita
sobreposição e empilhamento de descontos antes da criação do backend definitivo
na etapa 03A.

## Estrutura dos documentos

```ts
{
  schemaVersion: 2,
  content: {
    pt: { name: string, description: string },
    en: { name: string, description: string },
    ja: { name: string, description: string }
  },
  status: "active" | "inactive",
  eligibleProductIds: string[],
  requiredQuantity: number,
  pricing: {
    mode:
      | "fixed_total"
      | "fixed_discount"
      | "percentage_discount",
    regularTotalMinor: number | null,
    promotionalTotalMinor: number | null,
    discountMinor: number | null,
    percentage: number | null
  },
  startsAt: Timestamp | null,
  endsAt: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string,
  updatedBy: string
}
```

## Pedido

Pedidos da loja passam a incluir:

```text
subtotal
discount
offersApplied
```

`offersApplied` preserva:

- ID e nome da oferta;
- modo de preço;
- quantidade obrigatória;
- quantidade de kits aplicados;
- valores configurados;
- desconto efetivo;
- produtos e quantidades usados na oferta.

Isso impede que a edição futura da promoção altere a leitura de pedidos já
realizados.

## Instalação

Na raiz de `yamada-landing`:

```bash
git add -A
git commit -m "checkpoint antes do catalogo de ofertas 02B"

unzip -o yamada-catalog-02b-offers-kits.zip -d .
```

Encerre qualquer `npm run dev` ativo antes de limpar o cache:

```bash
rm -rf .next
npm run build
```

## Publicar as regras

O pacote adiciona leitura pública e escrita pelo dono em:

```text
sellers/{sellerId}/offers
```

Também libera os campos de snapshot no pedido.

Depois que o build passar:

```bash
firebase use yamada-apps
firebase deploy --only firestore:rules
```

## Teste funcional

1. Abra `/seller/offers`.
2. Crie uma oferta com pelo menos dois produtos.
3. Defina quantidade obrigatória `10`.
4. Escolha `Preço total fixo`.
5. Informe total normal e total promocional.
6. Salve e confirme o documento em `sellers/{sellerId}/offers`.
7. Abra `/store/{sellerId}`.
8. Selecione a oferta.
9. Adicione uma combinação que totalize 10 itens elegíveis.
10. Confirme a indicação de oferta aplicada e a economia.
11. Finalize um pedido.
12. Confira `subtotal`, `discount` e `offersApplied` no pedido.
13. Abra o pedido no painel do seller e confira a oferta aplicada.

## Importante

O cálculo ainda é refeito dentro da transação do cliente para impedir que uma
oferta removida, vencida ou alterada seja usada com dados antigos.

A etapa 03A moverá criação, recálculo e validação integral do pedido para o
backend. Portanto, não trate a implementação 02B como a camada final de
segurança financeira.
