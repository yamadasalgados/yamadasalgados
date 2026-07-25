# 03B.3 — bloqueio rígido de estoque e urgência

## Regra comercial

Produtos normais com estoque controlado só podem ser vendidos quando toda a
quantidade solicitada estiver disponível.

Exemplo:

```text
quantity: 10
reserved: 6
available: 4
cliente solicita: 6
resultado: pedido bloqueado
```

Não há mais reserva parcial para produtos normais.

Produtos `made_to_order` continuam aceitando reservas antecipadas, pois não
dependem do estoque físico imediato.

## Concorrência

A validação ocorre dentro da mesma transação que cria o pedido e atualiza
`inventory.reserved`.

Se dois clientes tentarem comprar as últimas unidades simultaneamente, o
Firestore repete a transação concorrente com o estoque atualizado. Apenas os
pedidos que ainda couberem integralmente no estoque são aceitos.

## Cards da Store e do evento

```text
estoque acima de 10
→ número oculto

estoque entre 1 e 10
→ card em destaque
→ número exato visível
→ “Últimas X unidades — garanta a sua.”

estoque igual a 0
→ card marcado como Esgotado
→ botão de compra bloqueado
```

A quantidade no seletor também não ultrapassa o estoque disponível mostrado no
momento.

## Instalação

Na raiz de `yamada-landing`:

```bash
unzip -o yamada-fix-03b3-hard-stock-limit-urgency.zip -d .
rm -rf .next
npm run build
```

## Publicação

Este pacote não altera `firestore.rules`.

Como altera `/api/orders/create`, publique o site pela Vercel antes de testar
concorrência em produção.
