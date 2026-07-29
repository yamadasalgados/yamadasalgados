# 06E1C — Correção de tipagem do timer de sincronização do evento

Corrige o build TypeScript da página pública de eventos.

## Problema

O timer foi declarado como:

```ts
ReturnType<typeof window.setTimeout>
```

Com os tipos DOM e Node carregados ao mesmo tempo, o TypeScript resolveu esse tipo como `Timeout`, enquanto `window.setTimeout(...)` retorna `number` no navegador.

## Correção

O timer agora é explicitamente um identificador de timer do navegador:

```ts
let refreshTimer: number | null = null;
```

A lógica de sincronização em tempo real não foi alterada.

## Aplicação

```bash
unzip -o yamada-06E1C-event-refresh-timer-type-fix.zip -d .
rm -rf .next
npm run build
```

Não é necessário publicar Firestore Rules, Storage Rules, índices ou Cloud Functions.
