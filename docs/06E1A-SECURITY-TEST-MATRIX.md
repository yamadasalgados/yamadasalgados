# Matriz de testes — 06E1A

| Perfil | Operação | Esperado |
|---|---|---|
| Visitante | Ler `sellers/{sellerId}` diretamente | Negado |
| Visitante | Usar `/api/public/sellers/{sellerId}` | Permitido, DTO sanitizado |
| Visitante | Consultar produtos `active`/`made_to_order` | Permitido |
| Visitante | Consultar produto `inactive` | Negado/não retornado |
| Visitante | Consultar oferta ativa | Permitido |
| Visitante | Consultar oferta inativa | Negado/não retornado |
| Visitante | Ler evento ativo de seller disponível | Permitido |
| Visitante | Ler evento cancelado/inativo | Negado |
| Visitante | Ler/criar `messages` pelo SDK | Negado |
| Visitante com token | GET/POST `/api/public/event-chat` | Permitido |
| Visitante com token inválido | GET/POST `/api/public/event-chat` | 403 |
| Cliente | Ler/escrever `customers/**` pelo SDK | Negado |
| Cliente | Consultar pedidos/carteira pelas APIs | Permitido ao próprio usuário |
| Cliente vinculado a seller | Criar/editar produtos pelo SDK | Negado |
| Seller ativo e pago | Gerenciar catálogo/eventos | Permitido |
| Seller ativo e pago | Atualizar status/produção/pontos via API | Permitido |
| Seller vencido | Escrita operacional | Negado |
| Seller suspenso | Escrita operacional | Negado |
| Admin ativo | Administração | Permitido |
| Usuário com role admin e conta suspensa | Administração | Negado |
