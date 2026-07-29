# 06D8 — Presentes de pontos e repasse por evento

Este patch adiciona duas formas auditáveis de crédito de pontos ao sistema multi-seller:

1. o seller pode presentear uma conta de cliente com pontos;
2. um evento pode direcionar os pontos gerados pelas vendas para uma conta de vendedor ou apresentador.

## Pré-requisito

Aplicar sobre o projeto já atualizado até a etapa 06D7.

## Presentear pontos

Acesse:

```text
/seller/rewards
```

O seller pode localizar uma conta pelo e-mail usado no login, telefone internacional ou UID, conferir o saldo e informar:

- quantidade de pontos;
- motivo ou observação;
- confirmação antes do crédito.

A operação ocorre em uma API autenticada e registra:

- conta destinatária;
- saldo anterior e posterior;
- quantidade;
- motivo;
- usuário responsável;
- data e hora;
- chave de idempotência contra repetição da mesma tentativa.

Os créditos são separados por seller em `customers/{uid}/rewardWallets/{sellerId}`.

## Pontos destinados ao apresentador do evento

Na aba de configuração de cada evento, o seller escolhe entre:

- pontos para o cliente de cada pedido;
- pontos para uma única conta de vendedor/apresentador.

Ao escolher o apresentador, a conta precisa ser localizada e confirmada. Cada novo pedido salva um snapshot do recebedor configurado naquele momento. Alterações posteriores no evento não mudam pedidos antigos.

O cliente ainda pode usar o próprio saldo como desconto. Somente os novos pontos gerados pela compra são destinados ao apresentador, sem crédito duplicado.

Os pontos entram quando o pedido é marcado como entregue, seguindo a regra já existente. Cancelamentos não creditam os pontos gerados e devolvem ao comprador os pontos que ele tiver usado no pedido.

## Visibilidade e auditoria

- A página pública do evento avisa quem receberá os pontos gerados.
- A confirmação do pedido informa quantos pontos foram destinados ao apresentador.
- O detalhe do pedido do cliente diferencia pontos próprios e pontos destinados ao evento.
- A carteira do apresentador registra a movimentação como `event_earn`.
- O painel do evento mostra total, pendente e já creditado.
- Presentes manuais aparecem como `gift` na carteira e no histórico do seller.

## Instalação

Na raiz do projeto:

```bash
git add -A
git commit -m "checkpoint antes da 06D8"

unzip -o yamada-06D8-reward-gifts-event-allocation.zip -d .

npm install
npm run audit:white-label
rm -rf .next
npm run build
```

Depois, publique normalmente na Vercel.

Esta etapa não altera Firestore Rules, Storage Rules nem Cloud Functions. As novas operações sensíveis usam Firebase Admin nas rotas do servidor.

## Estruturas principais

### Presente manual

```text
sellers/{sellerId}/rewardAdjustments/{movementId}
customers/{customerUid}/rewardWallets/{sellerId}
customers/{customerUid}/rewardWallets/{sellerId}/transactions/{movementId}
```

### Configuração do evento

```text
sellers/{sellerId}/events/{eventId}.rewardAssignment
```

### Snapshot no pedido

```text
order.rewards.earnRecipientType
order.rewards.earnRecipientUid
order.rewards.earnRecipientName
order.rewards.pointsAssignedToPresenter
order.rewards.eventRewardAssignmentSnapshot
```
