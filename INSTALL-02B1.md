# Catálogo 02B.1 — fluxo livre de ofertas e produtos sob encomenda

## Correções

- selecionar uma oferta não limita mais a navegação aos produtos participantes;
- voltar às categorias não remove a oferta selecionada;
- produtos fora da promoção continuam podendo ser adicionados pelo preço normal;
- o desconto considera somente as quantidades elegíveis da oferta;
- ofertas aparecem em carrossel horizontal no topo;
- produtos normais aparecem em uma seção própria;
- itens sob encomenda aparecem em uma seção inferior separada;
- novo status de produto: `made_to_order`;
- itens sob encomenda ignoram o estoque comum e são marcados no snapshot do pedido.

## Instalação

Na raiz de `yamada-landing`:

```bash
unzip -o yamada-catalog-02b1-store-flow-made-to-order.zip -d .
rm -rf .next
npm run build
```

Não há mudança em Firestore Rules neste pacote.

## Testes

1. Selecione uma oferta.
2. Adicione a quantidade necessária de produtos elegíveis.
3. Volte às categorias.
4. Adicione um produto que não participa da oferta.
5. Confirme que a oferta continua selecionada e o desconto não some.
6. Crie um produto com status `Sob encomenda`.
7. Confirme que ele aparece na seção inferior e pode ser comprado mesmo com estoque zero.
8. Confira no pedido o item com `availabilityStatus: made_to_order` e `productionMode: made_to_order`.

## Próxima subetapa

A integração de ofertas nos eventos entra no 02B.2, com snapshot da oferta no evento e cálculo aplicado ao pedido do evento. Ela será feita separadamente porque exige atualizar seleção, página pública do evento e criação do pedido ao mesmo tempo.
