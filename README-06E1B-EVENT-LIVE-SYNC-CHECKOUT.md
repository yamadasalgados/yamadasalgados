# 06E1B — Evento sincronizado, ordem editorial e checkout em modal

## Objetivo

Corrigir a página pública do evento para que ela acompanhe as edições do catálogo do seller e simplificar a experiência de compra.

## Alterações

### Sincronização em tempo real

A página pública passa a observar:

- documento do evento;
- itens publicados no evento;
- coleção legada `events/{eventId}/products`;
- catálogo atual `sellers/{sellerId}/products`;
- ofertas publicadas no evento.

O evento preserva somente as decisões próprias:

- produto incluído ou excluído;
- ordem de exibição;
- venda normal ou sob encomenda.

Os dados comerciais passam a acompanhar o catálogo atual:

- nome;
- imagem e galeria;
- categoria;
- preço;
- preço programado e countdown;
- estoque;
- prazo de produção;
- ativação ou desativação.

A API de criação de pedidos usa a mesma fonte de verdade. Assim, a página e o servidor não divergem quando o preço do catálogo é editado.

### Ordem dos produtos

Na aba **Configuração** do evento foi adicionada a seção **Ordem de exibição dos produtos**.

- Use as setas para mover o produto para cima ou para baixo.
- Salve a configuração.
- O array `productIds` mantém a ordem editorial.
- A página pública não ordena mais alfabeticamente.

Eventos antigos usam a ordem já existente em `productIds`. Basta reorganizar e salvar uma vez quando necessário.

### Controles de apresentação

Cada evento agora pode definir:

- mostrar ou ocultar cards de preço programado e countdown;
- mostrar ou ocultar cards de descontos, ofertas e kits.

Os campos são armazenados em:

```text
presentationSettings.schemaVersion
presentationSettings.showScheduledPriceCards
presentationSettings.showOfferCards
```

A ausência desses campos mantém ambos ativados, garantindo compatibilidade com eventos antigos.

Ocultar os cards de preço não impede a mudança automática do valor. Ocultar ofertas também é validado no servidor, impedindo que uma requisição manual aplique uma oferta escondida.

### Cabeçalho

Em telas médias e grandes:

- nome, região e datas ficam à esquerda;
- seller e cápsula **Conheça a loja** ficam alinhados à direita na mesma linha.

Em telas pequenas, os blocos se reorganizam verticalmente sem estourar a largura.

### Checkout em modal

Os campos do cliente, entrega, data, hora, pontos, resumo e confirmação saíram do fluxo longo abaixo dos produtos.

Agora a página mostra um botão compacto e fixo próximo à navegação inferior:

- quantidade de itens;
- total atual;
- ação **Revisar e finalizar pedido**.

Ao tocar, abre um modal com o checkout completo. Depois da conclusão, o modal rola automaticamente para a confirmação e o chat do pedido.

## Arquivos alterados

- `app/event/[...id]/EventClient.tsx`
- `app/seller/events/[eventId]/EventPanelClient.tsx`
- `app/api/orders/create/route.ts`
- `package.json`

## Arquivo adicionado

- `scripts/audit-event-experience.mjs`

## Instalação

Na raiz do projeto:

```bash
unzip -o yamada-06E1B-event-live-sync-order-checkout-modal.zip -d .

npm install
npm run audit:event-experience
npm run audit:scheduled-price
npm run audit:firestore-security

rm -rf .next
npm run build
```

O projeto atual não possuía um comando `audit:scheduled-price` no `package.json`; nesse caso execute diretamente:

```bash
node scripts/audit-scheduled-price.mjs
```

## Publicação

Publique novamente o aplicativo na Vercel.

Não é necessário publicar:

- Firestore Rules;
- Storage Rules;
- índices;
- Cloud Functions.

## Observação sobre o build neste ambiente

A instalação local das dependências não pôde ser concluída porque o registry interno não disponibilizou `zod-validation-error@4.0.2`. Os arquivos TypeScript alterados foram validados pelo compilador em modo de transpile, sem diagnósticos sintáticos, e as auditorias do projeto foram executadas.
