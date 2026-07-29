# 06D7A — Persistência de preço programado, contagem regressiva e Última chance

Esta correção complementa a etapa 06D7. Ela resolve o caso em que a data e a hora do novo preço pareciam ser salvas, mas voltavam vazias ao reabrir o editor, e o caso em que os cards não atualizavam a contagem regressiva.

## Causas corrigidas

1. Um `Timestamp` do Firestore podia perder seus métodos ao atravessar uma transformação de objeto. Como a leitura tentava primeiro esse objeto incompleto, ela não chegava ao campo numérico de segurança `startsAtMillis`.
2. Os relógios das páginas só atualizavam o array de produtos quando o preço ou o status mudavam. A passagem de “aviso” para “contagem regressiva” não alterava esses campos e, portanto, não provocava nova renderização.
3. O editor não conferia o documento depois da gravação. Uma divergência entre o formulário e o documento persistido podia passar despercebida.

## Correções de persistência

- A leitura tenta primeiro os campos em milissegundos e depois os formatos `Timestamp`, ISO e legados.
- São aceitos `Timestamp` normal, `seconds/nanoseconds` e `_seconds/_nanoseconds` serializados.
- O produto salva tanto o objeto `scheduledPriceChange` quanto campos redundantes de recuperação:
  - `scheduledPriceStartsAtMillis`;
  - `scheduledPriceNextMinor`;
  - `scheduledPriceEnabled`;
  - `scheduledPriceNoticeDays`;
  - `scheduledPriceShowCountdown`;
  - `scheduledPriceShowInLastChance`.
- Depois de criar ou editar, o sistema lê novamente o documento no Firestore e confirma preço e data.
- A conversão entre `datetime-local`, UTC e o fuso horário do seller foi reforçada e testada.

## Comportamento comercial

O seller pode escolher quando o aviso começa:

- 1 dia;
- 3 dias;
- 7 dias — padrão;
- 15 dias;
- 30 dias;
- período personalizado de 1 a 365 dias.

A contagem numérica aparece somente nas últimas 24 horas. Antes disso, dentro da janela configurada, aparece o aviso sem contador.

As fases visuais são:

- verde: aviso inicial;
- amarelo: faltam três dias ou menos;
- vermelho: últimas 24 horas;
- vermelho com pulsação discreta: última hora;
- azul por três dias depois da mudança: novo preço aplicado.

## Vitrine “Última chance”

A loja permanente cria automaticamente uma faixa horizontal com os produtos que:

- possuem aumento válido e futuro;
- já entraram na janela de aviso;
- estão marcados para aparecer em “Última chance”.

O seller pode desligar essa participação individualmente no formulário do produto.

## Atualização automática

As páginas abaixo atualizam o relógio a cada 30 segundos:

- catálogo do seller;
- loja permanente;
- página do evento.

Na virada da data e hora, o novo preço entra automaticamente. A API do pedido continua sendo a autoridade final e recusa um checkout aberto com preço antigo usando `PRICE_CHANGED`.

## Produtos que já estavam cadastrados

- Se o documento já contém um campo numérico de data, esta correção o recupera automaticamente.
- Se a data nunca chegou a ser gravada no Firestore, abra o produto, informe novamente a data e salve uma vez.
- Se faltam mais dias do que a janela configurada, o aviso público não aparecerá ainda. Isso é o comportamento esperado. O painel do seller continua mostrando o agendamento.
- Se faltam mais de 24 horas, o card mostra o aviso, mas não a contagem numérica. O contador aparece apenas no último dia.

## Instalação

Aplique depois das etapas 06D7 e 06E1A:

```bash
unzip -o yamada-06D7A-scheduled-price-persistence-last-chance.zip -d .

node scripts/audit-scheduled-price.mjs

rm -rf .next
npm run build
```

Depois publique o aplicativo na Vercel.

Esta etapa não altera Firestore Rules, Storage Rules, índices nem Cloud Functions. Não execute `firebase deploy` por causa deste patch.
