# 06E1E — Eventos por categoria, carrinho fixo e checkout sem entrega

Este patch parte da 06E1D e altera somente a experiência da página pública de eventos, a configuração do evento e a criação do pedido.

## 1. Produtos separados por categoria

A página do evento continua respeitando a ordem editorial salva pelo seller, mas agora cria blocos visuais por categoria.

- A ordem das categorias segue o primeiro produto de cada categoria na ordem escolhida pelo seller.
- A ordem dos produtos dentro de cada categoria continua sendo a ordem definida no painel.
- Produtos normais e produtos sob encomenda são agrupados separadamente.
- Quando existem várias categorias, os atalhos de categoria continuam disponíveis.

## 2. Faixa do carrinho sempre visível

A faixa “Revisar e finalizar pedido” deixou de ser apenas `sticky` no final do catálogo e passou a ser `fixed`.

- Fica visível durante toda a navegação.
- Respeita a barra inferior no celular.
- Mostra ícone de carrinho, badge de quantidade e total.
- Some enquanto o modal de checkout está aberto.
- A página recebe espaço inferior para que o último card não fique coberto.

## 3. Entrega opcional por evento

Ao criar ou editar um evento, o seller pode escolher:

- não perguntar ao cliente, porque o seller já sabe onde entregar;
- somente entrega;
- somente retirada;
- entrega ou retirada.

Quando “Não perguntar ao cliente” estiver selecionado:

- o checkout não mostra modo de entrega;
- não mostra seleção de data e hora;
- não solicita localização;
- o pedido é salvo com `deliveryMode: "none"`;
- uma data real do evento pode ser preservada quando já estiver configurada.

Eventos antigos sem os campos `allowDelivery` e `allowPickup` mantêm o comportamento legado de oferecer entrega e retirada.

## 4. Correção da finalização do pedido

A página estava usando o mesmo texto tanto para exibição quanto para envio à API. Quando o cliente selecionava “A combinar”, o navegador enviava:

```text
A combinar
```

no campo `delivery.date`, mas a API aceita somente uma data `YYYY-MM-DD` ou campo vazio. Isso produzia `INVALID_REQUEST` e a interface escondia a mensagem real atrás de “Não foi possível registrar o pedido”.

Agora:

- textos de interface nunca são enviados como data ou horário;
- “A combinar” envia data e horário vazios;
- a API também remove rótulos legados em PT/EN/JA para proteger versões antigas em cache;
- erros `INVALID_REQUEST`, rede e limite de tentativas exibem a mensagem real devolvida pelo servidor.

## Aplicação

Na raiz do projeto:

```bash
unzip -o yamada-06E1E-event-categories-fixed-cart-fulfillment.zip -d .

npm install
npm run audit:event-catalog-checkout
npm run audit:event-experience
npm run audit:store-cart-experience
npm run audit:firestore-security
npm run audit:white-label

rm -rf .next
npm run build
```

Depois publique o aplicativo na Vercel.

Este patch não altera Firestore Rules, Storage Rules, índices ou Cloud Functions. Não é necessário executar `firebase deploy`.

## Evento já existente

Para esconder entrega, data e hora em um evento já criado:

1. abra o painel do evento;
2. entre em **Configurações**;
3. localize **Dados de entrega mostrados ao cliente**;
4. selecione **Não perguntar ao cliente (organizado pelo seller)**;
5. salve.

## Validações executadas

- 22 verificações específicas da 06E1E;
- 12 verificações da experiência de eventos;
- 22 verificações da experiência de carrinho da loja;
- 37 verificações de preço programado;
- 18 verificações de segurança do Firestore;
- auditoria white-label;
- validação sintática dos quatro arquivos TypeScript/TSX alterados;
- auditoria de imports locais em 182 arquivos de código.

O `npm ci` e o build completo não puderam ser executados neste ambiente porque o registry interno não disponibiliza `zod-validation-error@4.0.2`. O build deve ser confirmado no projeto local, onde as dependências já estão disponíveis.
