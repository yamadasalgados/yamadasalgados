# 06E1G — Configurações do seller por categoria

A rota `/seller/settings` agora funciona como uma central de acesso, sem concentrar todos os formulários em uma única página.

## Categorias

- `/seller/settings/identity` — identidade e loja pública;
- `/seller/settings/regional` — região, idioma, moeda e fuso horário;
- `/seller/settings/orders` — política de pedidos acima do estoque;
- `/seller/settings/fulfillment` — retirada, delivery e correio;
- `/seller/settings/notifications` — Web Push para novos pedidos;
- `/seller/settings/printing` — perfis de impressão e recibos;
- `/seller/settings/account` — plano, limites e status de acesso.

A central também contém atalhos para pedidos, eventos, produção, produtos, ofertas, pontos, relatórios, onboarding, planos e loja pública.

## Validação

```bash
npm run audit:seller-settings
rm -rf .next
npm run build
```
