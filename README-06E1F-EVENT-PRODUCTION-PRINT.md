# 06E1F — Impressão consolidada da produção do evento

Esta etapa adiciona ao painel de produção do evento uma impressão consolidada com a soma de todos os itens dos pedidos válidos.

## O que foi implementado

- Botão **Imprimir produção completa** na aba Produção do evento.
- Filtro opcional por data de entrega; ao selecionar uma data, o botão passa a imprimir somente aquela data.
- Soma autoritativa no backend de todas as quantidades do evento.
- Pedidos cancelados são ignorados.
- Lista impressa contém evento, filtro de data, quantidade de pedidos, total de unidades, produtos, categorias e caixas de conferência.
- O job é enviado somente para perfis capazes de imprimir a via de produção.
- A impressão manual funciona mesmo que o perfil esteja com impressão automática de novos pedidos desativada.
- Chave de idempotência evita duplicação causada por repetição da mesma requisição.
- QR Code da via de produção pode abrir diretamente a aba Produção do evento.
- Print Service atualizado para a versão 2.2.0 e nova capacidade `event-production-summary`.
- Seletor de data e botão de impressão usam a mesma altura, alinhamento e grade responsiva; no celular ocupam a largura disponível sem desalinhamento ou quebra do texto.

## Aplicação no projeto web

Na raiz do projeto:

```bash
unzip -o yamada-06E1F-event-production-summary-print.zip -d .

npm install
npm run audit:event-production-print
npm run audit:event-catalog-checkout
npm run audit:event-experience
npm run audit:firestore-security
npm run audit:white-label

rm -rf .next
npm run build
```

Depois publique a aplicação na Vercel.

## Atualização obrigatória do Print Service

O Print Service antigo não reconhece o novo tipo de job. Depois de aplicar o patch no computador ou servidor que executa o serviço:

```bash
cd print-service
npm install
npm run doctor
```

Em seguida, reinicie o Print Service ou a tarefa/serviço que o mantém em execução.

O serviço atualizado anuncia a capacidade:

```text
event-production-summary
```

Serviços antigos não capturam esse job, evitando que a impressão seja marcada como concluída sem realmente produzir a lista.

## Uso

1. Abra o painel do evento.
2. Entre na aba **Produção**.
3. Escolha **Todas** ou uma data específica.
4. Clique em **Imprimir produção completa** ou **Imprimir esta data**.

O sistema soma novamente as quantidades no servidor antes de criar a impressão; ele não confia apenas no resumo que está aparecendo no navegador.

## Firebase

Esta etapa não altera Firestore Rules, Storage Rules ou índices. Não é necessário executar `firebase deploy`.
