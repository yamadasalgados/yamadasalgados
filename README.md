# Correção — permissões da tela Admin / Planos

## Sintoma

A tela `/admin/plans` mostra:

```text
Missing or insufficient permissions.
```

e os contadores ficam em zero.

## Causa

A página usa uma consulta de grupo:

```ts
collectionGroup(db, "planRequests")
```

A regra existente:

```text
/sellers/{sellerId}/planRequests/{requestId}
```

protege corretamente a subcoleção de cada seller, mas não autoriza uma
`collectionGroup` global. No Firestore Rules v2, essa consulta precisa de uma
regra com wildcard recursivo.

Como o carregamento utiliza `Promise.all`, a falha da consulta de
`planRequests` cancela também o carregamento visual de `sellers` e `users`.
Por isso a página mostra `0`, mesmo existindo um seller.

## Correção adicionada

```rules
match /{path=**}/planRequests/{requestId} {
  allow read: if isAdmin();
}
```

A regra concede somente leitura global ao administrador. Sellers continuam
lendo apenas a própria subcoleção pela regra específica, e todas as alterações
continuam protegidas pelas regras existentes.

## Instalação

Na raiz de `yamada-landing`:

```bash
cp firestore.rules firestore.rules.backup-before-planrequests-fix
unzip -o yamada-fix-admin-planrequests-collection-group.zip -d .

firebase use yamada-apps
firebase deploy --only firestore:rules
```

Depois recarregue `/admin/plans`. Caso a página já esteja aberta, use o botão
`Atualizar` ou faça recarga completa.

Não é necessário alterar documentos do Firestore nem executar novamente o
bootstrap.
