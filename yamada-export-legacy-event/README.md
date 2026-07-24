# Exportação segura de evento legado

Este pacote exporta dados de:

```text
/events/{eventId}
/events/{eventId}/orders/{orderId}
```

Ele foi feito para preservar os pedidos do sistema antigo antes de remover as
coleções legadas da raiz do Firestore.

## O que é exportado

### `orders.csv`

Uma linha por pedido, começando pelos campos principais:

```text
channel
customerName
quantities
```

Também inclui:

```text
orderId
quantitiesJson
totalItems
amountYen
status
deliveryDate
deliveryMode
deliveryTimeSlot
paid
createdAt
updatedAt
```

### `product-summary.csv`

Soma a quantidade vendida de cada produto.

### `channel-summary.csv`

Mostra o número de pedidos, itens e valor por canal.

### `event-and-orders.json`

Cópia estruturada do documento do evento e de todos os pedidos, útil como
backup completo.

### `manifest.json`

Registra quantidade de pedidos e hash SHA-256 dos arquivos para verificar a
integridade do backup.

## Segurança

O exportador é somente leitura. Ele não contém comandos de exclusão e não
altera documentos no Firestore.

Nunca envie ou versione `serviceAccountKey.json`.

Adicione a chave ao `.gitignore`:

```bash
grep -qxF "serviceAccountKey.json" .gitignore   || echo "serviceAccountKey.json" >> .gitignore
```

## Instalação

Na raiz do projeto:

```bash
unzip -o yamada-export-legacy-event.zip -d .
```

O projeto já possui `firebase-admin`, portanto não é necessário instalar outra
biblioteca.

## 1. Conferir os eventos legados

Com `serviceAccountKey.json` na raiz:

```bash
node scripts/list-legacy-events.cjs
```

Para informar outro caminho:

```bash
node scripts/list-legacy-events.cjs   --key /caminho/seguro/serviceAccountKey.json
```

## 2. Exportar o evento

Copie o ID exato no Firebase Console e execute:

```bash
node scripts/export-legacy-event-orders.cjs   --event-id ID_EXATO_DO_EVENTO
```

Exemplo baseado na tela enviada:

```bash
node scripts/export-legacy-event-orders.cjs   --event-id oqrEHAE2s9GyeAKAkuAA
```

Confirme o ID no Console antes de executar, pois a imagem pode ocultar parte do
texto.

## Resultado

Será criada uma pasta semelhante a:

```text
exports/legacy-event-oqrEHAE2s9GyeAKAkuAA-2026-07-24T...
```

Abra `orders.csv` no Excel, Numbers ou Google Sheets.

## Verificação antes de excluir

Confirme:

1. a quantidade mostrada no terminal;
2. o número de linhas em `orders.csv`;
3. se `customerName`, `channel` e `quantities` estão preenchidos;
4. se `event-and-orders.json` abre normalmente;
5. se os arquivos foram copiados para outro local seguro.

Somente depois dessa conferência deve ser preparada a remoção do evento legado.
A exclusão não faz parte deste pacote.
