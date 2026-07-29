# 06D7B — Correção de tipagem regional no evento

Corrige a falha de build em `app/event/[...id]/EventClient.tsx`:

```text
Property 'currency' does not exist on type '{}'.
```

## Causa

`fetchPublicSellerProfile()` já retorna `sellerData.regional` com tipo normalizado, mas o fallback condicional para `{}` criava uma união com objeto vazio. Assim, o TypeScript não garantia a existência de `currency`, `locale`, `timeZone` e `operatingCountry`.

## Correção

O código agora usa diretamente:

```ts
const sellerRegional = sellerData.regional;
```

O aviso de `baseline-browser-mapping` não é a causa da falha de build. Ele pode ser atualizado separadamente com:

```bash
npm i baseline-browser-mapping@latest -D
```
