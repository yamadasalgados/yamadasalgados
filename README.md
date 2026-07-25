# Limpeza das Firestore Rules

Remove somente funções que ficaram sem uso depois que a criação pública direta
de pedidos foi bloqueada no 03A:

```text
sellerAcceptsOrders
validOptionalLimitedString
isValidPublicOrderCreate
```

As permissões atuais não são alteradas.

## Instalação

```bash
unzip -o yamada-fix-firestore-remove-unused-order-rules.zip -d .
firebase deploy --only firestore:rules
```
