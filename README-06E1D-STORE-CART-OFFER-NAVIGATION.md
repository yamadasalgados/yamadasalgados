# 06E1D — Última chance comprável, ofertas guiadas e navegação do carrinho

## Objetivo

Reduzir o atrito entre descobrir um produto e concluir a compra na loja permanente, aproveitando melhor os gatilhos de **Última chance** e das ofertas por quantidade.

## Alterações

### Compra direta na vitrine “Última chance”

Os cards de produtos com aumento programado agora permitem comprar sem sair da vitrine:

- botão **Adicionar ao carrinho**;
- controles de diminuir e aumentar a quantidade após a inclusão;
- respeito ao estoque disponível e à configuração de aceitar pedidos acima do estoque;
- abertura do configurador quando o produto for um kit personalizável;
- acesso aos detalhes e à galeria ao tocar na área principal do card.

O preço exibido e adicionado continua sendo o preço atual calculado pelo sistema. A API de pedidos mantém a validação autoritativa no momento da finalização.

### Progresso da oferta no produto correto

Quando o carrinho contém produtos participantes de uma oferta, os respectivos cards passam a receber destaque visual:

- laranja enquanto faltam unidades;
- verde quando a oferta é ativada;
- cápsula mostrando o nome da oferta e exatamente quantos itens ainda faltam;
- destaque aplicado somente aos produtos elegíveis para aquela oferta.

Produtos participantes ainda não adicionados também aparecem no painel de conclusão da oferta, permitindo ao cliente escolher quais itens deseja acrescentar.

### Ajuste da oferta no carrinho e na finalização

A mensagem genérica que aparecia separada acima do total foi substituída por uma orientação contextual.

No carrinho e no resumo final:

- cada item participante recebe sua própria cápsula;
- itens participantes ficam visualmente diferenciados;
- o cliente pode aumentar ou diminuir quantidades sem voltar ao catálogo;
- o painel lista os demais produtos elegíveis;
- kits podem ser abertos novamente para editar a composição;
- o desconto e a confirmação da oferta ficam verdes depois da ativação.

Itens comuns continuam compactos no resumo. Os controles adicionais aparecem principalmente onde ajudam a concluir a oferta.

### Carrinho e pedidos no mesmo painel

O drawer lateral agora possui duas abas:

1. **Carrinho** — produtos atuais, quantidades, ofertas e total;
2. **Pedidos** — compras em andamento e histórico.

Para clientes cadastrados, a aba de pedidos consulta a API autenticada e mostra:

- pedidos recebidos;
- pedidos em preparação;
- pedidos prontos;
- pedidos entregues;
- pedidos cancelados;
- compras desta loja e de outros sellers;
- acesso ao detalhe de cada pedido e à página completa de histórico.

Clientes não cadastrados recebem um convite para entrar ou criar conta. Depois do login, o retorno abre novamente o carrinho.

### Navegação inferior

Na loja permanente, a antiga aba **Pedidos** da navegação do cliente passa a ser **Carrinho**.

- mostra badge com a quantidade total de itens;
- abre o drawer diretamente quando o cliente já está na loja;
- redireciona para a loja com `openCart=1` quando necessário;
- mantém o contador isolado por seller;
- sincroniza a quantidade entre a página e a navegação por `CustomEvent` e `localStorage`.

A aba interna **Pedidos** permanece dentro do drawer, junto ao carrinho.

### Barra sempre acessível

A barra superior dos produtos fica sticky durante a rolagem e agora contém:

- botão de voltar sempre visível;
- busca;
- ícone do carrinho sempre visível;
- badge com a quantidade atual.

O botão de voltar primeiro fecha categoria, filtro ou busca. Na vitrine principal, usa o histórico do navegador e, quando não existe histórico útil, retorna ao topo.

## Arquivos alterados

- `app/store/[sellerId]/StoreClient.tsx`
- `app/_components/RoleNavigation.tsx`
- `package.json`

## Arquivos adicionados

- `app/lib/cart-navigation.ts`
- `scripts/audit-store-cart-experience.mjs`
- `README-06E1D-STORE-CART-OFFER-NAVIGATION.md`
- `MANIFEST-06E1D.json`

## Instalação

Aplique este patch depois da 06E1C:

```bash
unzip -o yamada-06E1D-store-cart-offer-navigation.zip -d .

npm install
npm run audit:store-cart-experience
npm run audit:event-experience
node scripts/audit-scheduled-price.mjs
npm run audit:firestore-security
npm run audit:white-label

rm -rf .next
npm run build
```

## Publicação

Publique novamente o aplicativo na Vercel.

Não é necessário publicar:

- Firestore Rules;
- Storage Rules;
- índices;
- Cloud Functions.

## Compatibilidade

- carrinhos locais já existentes continuam sendo carregados normalmente;
- o badge é recalculado a partir do carrinho atual assim que a loja abre;
- clientes anônimos continuam podendo comprar;
- somente a consulta de status e histórico exige conta autenticada;
- nenhuma estrutura de pedido, produto, oferta ou documento do Firestore foi alterada.

## Validação neste ambiente

Foram executadas:

- 22 verificações específicas da experiência de loja, carrinho e ofertas;
- 12 verificações da experiência de eventos;
- 37 verificações de preço programado;
- 18 verificações de segurança do Firestore;
- auditoria white-label;
- validação sintática TypeScript/TSX dos três arquivos de código da etapa;
- auditoria de imports locais em toda a pasta `app`.

O build completo deve ser confirmado no ambiente do projeto. O registry disponível neste ambiente não fornece `zod-validation-error@4.0.2`, impedindo a instalação integral das dependências usadas pelo Next.js.
