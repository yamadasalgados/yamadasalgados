# 06D2 — Auditoria e remoção de nomes fixos

Este pacote continua a base criada na **06D1** e remove marcas comerciais fixas das áreas compartilhadas do sistema. Ele é um **patch incremental** e deve ser aplicado sobre o projeto que já contém a 06D1.

## O que foi alterado

### Identidade neutra da plataforma

Foi criado `app/lib/platform-brand.ts` para as telas que não pertencem a um seller específico, como login, administração e entrada global da PWA.

Variáveis opcionais:

```text
NEXT_PUBLIC_PLATFORM_NAME
NEXT_PUBLIC_PLATFORM_SHORT_NAME
NEXT_PUBLIC_PLATFORM_DESCRIPTION
```

Sem essas variáveis, o sistema usa nomes neutros: `Order Portal` e `Orders`.

A marca comercial exibida em lojas, eventos, painel do seller e área vinculada do cliente continua vindo de:

```text
sellers/{sellerId}
```

### Pontos auditados

Foram removidos nomes e textos comerciais fixos de:

- metadata, título da aba e tela inicial;
- login e navegação de admin, seller e cliente;
- loja permanente e páginas de evento;
- instalação da PWA e Service Worker;
- notificações push e testes de notificação;
- APIs e telas de configuração de impressão;
- Print Service para Windows e macOS;
- relatórios e arquivos exportados;
- traduções, exemplos e textos auxiliares;
- funções administrativas antigas baseadas em e-mail fixo.

### Título e cor dinâmicos

Foi adicionado `useDocumentBranding` para aplicar dinamicamente:

- nome do seller no título da aba;
- nome do evento ou da loja;
- cor principal do seller em `theme-color`.

### Push e VAPID

As notificações não usam mais uma marca fixa. A configuração aceita:

```text
VAPID_SUBJECT=https://seu-dominio.com
```

ou:

```text
VAPID_SUBJECT=mailto:contato@seu-dominio.com
```

Por compatibilidade, `ADMIN_EMAIL` ainda é lido como fallback. Um e-mail simples também é normalizado automaticamente para `mailto:`. Isso evita o erro `Vapid subject is not a valid URL`.

### Autorização administrativa

A função administrativa legada de exclusão de seller deixou de usar uma lista fixa de e-mails. A autorização passa a verificar:

- custom claim `admin: true`;
- custom claim `role: "admin"`;
- ou `users/{uid}.role === "admin"`.

### Print Service genérico

As novas variáveis são:

```text
PRINT_BASE_URL
PRINT_SELLER_ID
PRINT_STATION_TOKEN
PRINT_STATION_NAME
```

As antigas variáveis `YAMADA_*` continuam aceitas apenas para migrar computadores já configurados. Os instaladores também removem tarefas antigas antes de registrar o novo serviço.

## Compatibilidade preservada

Alguns identificadores internos antigos não aparecem na interface e foram mantidos para não perder dados locais ou quebrar instalações existentes, por exemplo:

- chaves de `localStorage`;
- nomes de eventos internos do navegador;
- classes CSS de impressão;
- nome técnico do pacote/repositório;
- aliases antigos do Print Service usados somente na migração.

Eles não controlam a identidade pública da loja.

## Instalação

Na raiz do projeto, crie um checkpoint:

```bash
git add -A
git commit -m "checkpoint antes da 06D2 white-label audit"
```

Aplique o ZIP incremental:

```bash
unzip -o yamada-06D2-white-label-audit-completa.zip -d .
```

Limpe e valide:

```bash
npm run audit:white-label
rm -rf .next
npm run build
```

Como as funções de push foram atualizadas, compile e publique as Functions:

```bash
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only functions
```

Depois publique a aplicação Next.js/Vercel pelo fluxo habitual do projeto.

## Auditoria de regressão

Execute sempre que alterar textos globais, PWA, notificações ou impressão:

```bash
npm run audit:white-label
```

O script falha caso encontre novamente marcas comerciais fixas nas áreas auditadas.

## Testes recomendados

1. Abra `/`, `/login` e uma página administrativa e confirme que não há marca de seller fixa.
2. Entre como seller e confirme que o painel mostra a identidade configurada na 06D1.
3. Abra `/store/{sellerId}` e um evento público; confira título da aba, logo, nome e cor.
4. Instale ou atualize a PWA e confirme os nomes neutros da aplicação.
5. Faça um teste de push para seller e cliente.
6. Execute o Print Service com as novas variáveis e confirme que instalações antigas ainda migram.
7. Gere um relatório e confira o nome neutro do arquivo baixado.

## Validações realizadas no pacote

- auditoria automática sem nomes comerciais fixos visíveis;
- análise sintática dos arquivos TypeScript/TSX;
- verificação dos imports locais;
- validação dos JSON;
- verificação sintática de JavaScript/MJS;
- verificação de credenciais e arquivos sensíveis no ZIP.

O build completo deve ser confirmado localmente antes da publicação. No ambiente usado para montar o pacote, a instalação de dependências foi bloqueada pela indisponibilidade de uma dependência no registro interno.
