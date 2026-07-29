# 06D4 — Sistema flexível de retirada, delivery e correio

Esta etapa transforma as formas de recebimento da loja permanente em configurações white-label por seller e adiciona elegibilidade individual por produto.

## Configuração do seller

Em `/seller/settings`, o novo card **Formas de recebimento e frete** permite configurar separadamente:

- retirada;
- delivery local;
- envio por correio.

Cada método pode ter:

- ativo/inativo;
- nome exibido ao cliente;
- descrição;
- instruções;
- valor mínimo do pedido;
- valor a partir do qual a taxa fica grátis;
- prazo estimado mínimo e máximo.

Retirada e delivery também podem possuir taxa própria. No delivery local, o seller pode cadastrar regiões com taxa, pedido mínimo, gratuidade, prazo e instruções específicos.

Para correio, continuam disponíveis:

- frete a cobrar;
- frete a combinar;
- tabela por peso.

A configuração é salva em:

```text
sellers/{sellerId}/settings/shipping
```

com `schemaVersion: 3`. Os aliases antigos de correio são preservados durante a transição para manter clientes já publicados compatíveis.

## Elegibilidade por produto

Em `/seller/products`, ao criar ou editar um item, o seller escolhe qualquer combinação entre:

- retirada;
- delivery local;
- correio.

Pelo menos uma opção precisa permanecer ativa. Quando correio estiver ativo, o peso do produto pode ser informado para o cálculo por faixa.

Estrutura canônica:

```ts
shipping: {
  fulfillment: {
    pickup: true,
    localDelivery: true,
    postal: false
  },
  postalEligible: false,
  weightGrams: null
}
```

Também são salvos campos planos de compatibilidade (`pickupEligible`, `localDeliveryEligible`, `postalEligible` e `shippingWeightGrams`). Produtos antigos permanecem disponíveis para retirada e delivery e mantêm sua configuração postal anterior.

## Vitrines da loja

A página pública passa a montar automaticamente vitrines/filtros por forma de recebimento:

- produtos para retirada;
- produtos para delivery;
- produtos enviados por correio.

O nome personalizado do método, quando configurado pelo seller, também é usado nessas vitrines. Não é necessário duplicar produtos nem criar categorias manuais.

## Carrinho e checkout

O checkout mostra somente métodos ativos no seller e compatíveis com todos os produtos do carrinho.

Regras importantes:

- um carrinho misto só oferece métodos aceitos por todos os itens;
- taxas e gratuidade são recalculadas conforme o subtotal;
- delivery por região exige a seleção de uma região válida;
- endereço é obrigatório para delivery;
- correio por peso exige peso em todos os produtos e uma faixa que comporte o total;
- frete a cobrar e a combinar não são somados antecipadamente ao total;
- quando um método fica inválido após alterar o carrinho, o checkout migra para a primeira opção válida disponível;
- o prazo de produção da 06D3 continua sendo aplicado às datas de retirada e delivery.

## Validação autoritativa

`POST /api/orders/create` não confia no valor ou na disponibilidade enviados pelo navegador. Para pedidos da loja, a rota lê as configurações atuais e recalcula:

- método ativo;
- elegibilidade de todos os produtos;
- subtotal mínimo;
- região de delivery;
- taxa aplicável;
- gratuidade;
- peso total e faixa postal;
- endereço obrigatório.

Tentativas inválidas retornam `SHIPPING_UNAVAILABLE` ou `INVALID_REQUEST`.

## Snapshot no pedido

O pedido recebe um snapshot resolvido em `fulfillment`, contendo o método, nome, instruções, taxa, condição de gratuidade, prazo estimado e, quando aplicável, região ou dados postais.

Exemplo:

```ts
fulfillment: {
  schemaVersion: 1,
  method: "delivery",
  label: "Entrega em Kikugawa",
  feeMinor: 500,
  fee: 500,
  quoteStatus: "calculated",
  regionId: "kikugawa-centro",
  regionName: "Kikugawa centro"
}
```

Cada item também guarda sua elegibilidade e peso efetivamente usados. Assim, pedidos antigos não mudam quando o seller editar o produto ou as taxas posteriormente.

## Visualização do pedido

A área do seller e o detalhe do pedido do cliente agora exibem:

- nome personalizado da forma de recebimento;
- região selecionada no delivery;
- instruções preservadas no pedido.

## Compatibilidade

- Sellers antigos continuam com retirada e delivery ativos por padrão.
- Correio permanece conforme os campos legados já existentes.
- Produtos antigos continuam com retirada e delivery permitidos.
- A estrutura antiga de correio é migrada em memória e regravada no schema novo quando o seller salvar as configurações.
- O fluxo específico de eventos permanece preservado nesta etapa; a validação flexível é aplicada à loja permanente.

## Instalação do patch

Na raiz do projeto:

```bash
unzip -o yamada-06D4-flexible-fulfillment-shipping.zip -d .
rm -rf .next
npm install
npm run audit:white-label
npm run build
```

Não houve alteração nas Firestore Rules nem nas Cloud Functions. Depois do build, publique normalmente na Vercel.

## Checklist rápido

1. Abra `/seller/settings` e configure retirada, delivery e correio.
2. Cadastre duas regiões de delivery com taxas diferentes.
3. Edite produtos e habilite combinações distintas de recebimento.
4. Confira as vitrines automáticas na loja pública.
5. Misture produtos incompatíveis no carrinho e confirme que o método é bloqueado.
6. Selecione regiões diferentes e confira a mudança da taxa.
7. Teste correio por peso, frete a cobrar e frete a combinar.
8. Finalize um pedido e confira `fulfillment`, `shipping` e os snapshots dos itens no Firestore.
