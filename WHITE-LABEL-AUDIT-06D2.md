# Relatório de auditoria white-label — 06D2

Data: 2026-07-29

## Resultado

A interface compartilhada deixou de depender de um nome comercial fixo. A identidade pública agora segue duas camadas:

1. **Plataforma neutra:** entrada, login, administração, manifest e PWA global.
2. **Identidade do seller:** painel do seller, loja, evento e área do cliente vinculada.

## Matriz resumida

| Área | Fonte da identidade após 06D2 |
|---|---|
| Página inicial e login | `app/lib/platform-brand.ts` |
| Metadata global e PWA | plataforma neutra |
| Painel do seller | `sellers/{sellerId}` |
| Loja permanente | `sellers/{sellerId}` |
| Evento público | seller + título do evento |
| Área do cliente vinculada | seller relacionado |
| Push sem seller carregado | texto operacional neutro |
| Impressão | seller do job + Print Service neutro |

## Referências internas mantidas deliberadamente

Os identificadores antigos em `localStorage`, eventos internos, classes CSS e aliases de ambiente não são textos visíveis. A troca imediata apagaria preferências, rascunhos ou configurações já instaladas. Por isso, permanecem como camada de compatibilidade e podem ser migrados gradualmente sem impacto comercial.

## Proteções adicionadas

- script `scripts/audit-white-label.mjs`;
- comando `npm run audit:white-label`;
- título/cor do documento por seller;
- configuração central da marca neutra;
- remoção de autorização administrativa por e-mail fixo;
- normalização segura de `VAPID_SUBJECT`;
- suporte de migração no Print Service.

## Próxima etapa

**06D3 — Prazo individual de produção por produto.**
