# 06E2 — Catálogo 2.0 + Packs Mistos

## O que foi adicionado

### Categorias 2.0
- Hierarquia por `parentId` (categorias e subcategorias).
- Nomes em PT/EN/JA.
- Ordem de exibição.
- Tags editoriais.
- Capacidade `mixedPackEligible` por categoria.
- API pública sanitizada em `/api/public/sellers/[sellerId]/categories`.

### Produtos
- `productType: "standard" | "mixed_pack"`.
- Produto normal pode ter `mixedPackEligible: true`.
- `mixedPackConfig` separado do `bundleConfig` legado:
  - `unitsPerPack`;
  - `optionProductIds`;
  - `allowRepeats`;
  - `minDistinct`;
  - `maxPerProduct`.

### Pedido / estoque / produção
O Pack Misto permanece como item comercial do pedido, mas gera `inventoryItems` com os componentes reais.

Exemplo:
- venda: 1 × Bandeja Mista;
- composição: 1 × Coxinha + 1 × Risoles + 1 × Kibe;
- estoque/produção: Coxinha 1, Risoles 1, Kibe 1.

Produto comprado avulso e também dentro do pack é agregado no operacional. Exemplo: 2 Coxinhas avulsas + 1 Coxinha no pack = demanda operacional de 3 Coxinhas.

`inventoryItems` também é usado nos fluxos de status/cancelamento, produção e impressão de produção. A via do cliente continua usando `items` comerciais.

## Como testar no painel

1. Abra **Seller → Produtos**.
2. Clique em **Categorias 2.0**.
3. Crie uma categoria raiz, por exemplo `Salgados`.
4. Crie uma subcategoria `Fritos` escolhendo `Salgados` como categoria pai.
5. Marque **Produtos desta categoria podem ser usados em Pack Misto**.
6. Edite Coxinha, Risoles e Kibe e associe-os a `Salgados › Fritos`. Mantenha-os ativos e com estoque para o primeiro teste.
7. Crie um novo produto chamado `Bandeja Mista`.
8. Em **Tipo do produto**, selecione **Pack Misto**.
9. Configure, por exemplo:
   - quantidade por bandeja/pack: `3`;
   - mínimo de produtos/sabores diferentes: `3`;
   - máximo por produto: `1`;
   - não permitir repetir o mesmo produto;
   - opções: Coxinha, Risoles e Kibe.
10. Defina o preço comercial da Bandeja Mista e salve.
11. Abra a Store pública e clique em **Montar Pack Misto**.
12. Escolha 1 Coxinha + 1 Risoles + 1 Kibe e finalize o pedido.
13. Repita em um Evento publicando a Bandeja Mista no catálogo do evento.
14. Confira que o pedido comercial mostra a Bandeja, enquanto estoque/produção/impressão de produção usam os componentes.

## Auditoria
Rode:

```bash
npm run audit:catalog-2-mixed-pack
```

O script valida presença das estruturas e integrações principais e executa cenários comportamentais básicos do Pack Misto.
