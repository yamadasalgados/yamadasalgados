# 06E1A — Endurecimento das Firestore Rules

Este patch corrige permissões excessivas e ajusta o aplicativo para funcionar com regras mais restritivas, sem expor dados privados do seller, pedidos, carteiras ou conversas de eventos.

## Principais mudanças

### Ownership e acesso do seller

- Uma conta só é tratada como seller quando `users/{uid}.role == "seller"` e a conta está ativa.
- O vínculo por `sellerId` não concede mais poderes de seller a contas de cliente.
- Escritas operacionais exigem seller ativo, onboarding concluído e acesso/assinatura vigente.
- APIs de status, produção, pontos e impressão repetem a mesma validação no servidor.

### Documento privado do seller

O documento `sellers/{sellerId}` deixou de ser público porque contém ownership, assinatura, limites e outros dados internos.

As páginas públicas agora usam:

```text
GET /api/public/sellers/{sellerId}
```

A resposta contém apenas a identidade e os dados necessários para a vitrine.

### Catálogo e eventos públicos

- Produtos públicos: somente `active` e `made_to_order`.
- Ofertas públicas: somente `active`.
- Eventos públicos: somente sellers disponíveis e eventos ativos.
- Categorias administrativas não são mais listáveis publicamente.
- A loja e a lista regional passaram a fazer consultas compatíveis com essas regras.

### Pedidos, clientes e pontos

- Pedidos continuam sendo criados exclusivamente por `/api/orders/create`.
- Pedidos não são legíveis publicamente pelo SDK.
- Perfis de clientes, índices de pedidos, carteiras e transações de pontos continuam backend-only em `customers/**`.
- A área do cliente utiliza as APIs autenticadas já existentes.

### Chat de eventos

A regra antiga permitia leitura e criação pública de mensagens. Agora:

- seller/admin podem acessar a subcoleção diretamente;
- cliente usa `/api/public/event-chat`;
- cada novo pedido de evento recebe um token secreto aleatório;
- apenas o hash do token é salvo no pedido;
- o token bruto volta somente na resposta de criação e no marcador privado de idempotência;
- mensagens são limitadas a 1.500 caracteres;
- comparação do token usa SHA-256 e `timingSafeEqual`;
- o token é enviado no cabeçalho `Authorization`, não na URL.

Pedidos de evento criados antes deste patch não possuem o novo token. Após endurecer as regras, os chats antigos permanecem acessíveis ao seller, mas não ao cliente anônimo pela página pública. Novos pedidos funcionam normalmente.

## Auditoria automática

Execute:

```bash
npm run audit:firestore-security
```

O script verifica, entre outros pontos:

- presença de `default deny`;
- ausência de leitura pública do documento raiz do seller;
- ownership restrito a seller ativo;
- assinatura vigente nas rotas operacionais;
- filtros públicos de produtos e ofertas;
- ausência do chat público direto;
- uso das APIs públicas sanitizadas;
- ausência do padrão antigo e permissivo de ownership nas APIs.

## Ordem segura de publicação

A ordem é importante. O código novo funciona com as regras antigas, mas o código antigo não funciona completamente com as regras novas.

1. Faça um checkpoint no Git.
2. Aplique o patch.
3. Rode as auditorias e o build.
4. Publique primeiro o aplicativo na Vercel.
5. Somente depois publique as Firestore Rules.

```bash
git add -A
git commit -m "checkpoint antes da 06E1A"

unzip -o yamada-06E1A-firestore-security-hardening.zip -d .

npm install
npm run audit:white-label
npm run audit:firestore-security
rm -rf .next
npm run build
```

Depois de confirmar que a nova versão está online:

```bash
firebase deploy --only firestore:rules
```

Não é necessário publicar Storage Rules ou Cloud Functions para esta etapa.

## Testes mínimos após a publicação

### Visitante

- abre uma loja ativa;
- vê somente produtos publicáveis e ofertas ativas;
- não consegue ler o documento privado do seller;
- cria um pedido pelo backend;
- conversa no chat do novo pedido usando o token.

### Cliente autenticado

- acessa perfil, pedidos e carteira pelas APIs;
- não consegue escrever saldo ou transações diretamente;
- não recebe poderes de seller por possuir um `sellerId` de vínculo.

### Seller ativo

- gerencia catálogo e eventos;
- lê pedidos;
- atualiza status por API;
- usa produção, pontos e impressão.

### Seller vencido ou suspenso

- pode autenticar e consultar os dados necessários para cobrança/conta conforme a interface;
- não consegue operar pedidos, produção, pontos, impressão ou catálogo.

### Admin ativo

- mantém acesso administrativo global.

## Arquivos sensíveis

O patch não contém `.env`, chaves privadas, service accounts ou credenciais Firebase.
