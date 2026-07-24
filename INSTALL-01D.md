# Fundação 01D — remoção definitiva do modelo legado

Este pacote encerra as consultas e resoluções herdadas do modelo antigo.

## Modelo aceito

A página pública de evento passa a aceitar somente:

```text
/event/{sellerId}/{eventId}
```

E o Firestore passa a ser consultado somente em:

```text
sellers/{sellerId}/events/{eventId}
```

## Alterações

- remove a leitura de `/events/{eventId}` da página pública;
- links antigos com somente `eventId` passam a exibir “link inválido”;
- remove o fallback raiz dentro de `EventClient`;
- usa o `sellerId` do caminho como fonte de verdade para evento, pedido e chat;
- rejeita eventos cujo campo interno `sellerId` contradiga o caminho;
- remove o `collectionGroup("events")` da Cloud Function;
- exige `sellerId` no payload da função `createEventOrder`;
- mantém `/events` e `/products` da raiz explicitamente bloqueados nas Rules;
- amplia o auditor para verificar `app`, `functions` e `scripts`;
- o auditor passa a falhar com código 1 ao encontrar referência incompatível;
- remove a função não utilizada `validAccountStatus` das Rules.

## Instalação

Na raiz de `yamada-landing`:

```bash
git add -A
git commit -m "checkpoint antes da limpeza definitiva do legado 01D"

unzip -o yamada-foundation-01d.zip -d .
rm -rf .next
npm run build
```

Depois execute:

```bash
node scripts/audit-legacy-root-paths.cjs
```

Resultado esperado:

```text
Schema V2 confirmado: nenhuma leitura/gravação direta em /events ou /products e nenhum lookup ambíguo por collectionGroup foi encontrado.
```

## Rules

Como `firestore.rules` mudou apenas para remover uma função sem uso, publique
novamente depois do build:

```bash
firebase use yamada-apps
firebase deploy --only firestore:rules
```

## Functions

O pacote atualiza o fonte e o JavaScript compilado de `createEventOrder`.

Caso essa função esteja publicada no Firebase, use o processo de build já
configurado na pasta `functions` e depois publique:

```bash
firebase deploy --only functions:createEventOrder
```

Não execute esse deploy caso `createEventOrder` ainda não esteja exportada pelo
arquivo principal das Functions. O build do Next.js não publica Functions.

## Testes funcionais

1. Crie um evento novo.
2. Abra o link com dois parâmetros:
   `/event/{sellerId}/{eventId}`.
3. Confirme que produtos, pedido e chat usam o mesmo seller.
4. Abra `/event/{eventId}` com apenas um parâmetro.
5. Confirme que a página informa que o link antigo não é mais aceito.
6. Rode novamente o auditor.

## Arquivos alterados

```text
app/event/[...id]/page.tsx
app/event/[...id]/EventClient.tsx
functions/_src/createEventOrder.ts
functions/lib/createEventOrder.js
firestore.rules
scripts/audit-legacy-root-paths.cjs
```

## Observação

O pacote não exclui documentos e não executa migrações. As coleções antigas já
estão vazias e continuam bloqueadas pelas regras.
