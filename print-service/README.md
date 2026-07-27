# Yamada Print Service

Serviço local gratuito e multiplataforma para imprimir automaticamente os pedidos da Yamada em impressoras térmicas de 80 mm.

## Sistemas suportados

- Windows 10/11: `PRINT_MODE=windows`, usando SumatraPDF e a fila de impressão do Windows.
- macOS: `PRINT_MODE=cups`, usando CUPS.
- Linux com CUPS: `PRINT_MODE=cups`.
- Qualquer sistema: `PRINT_MODE=preview`, apenas para gerar PDFs.

## Arquitetura

1. Um pedido entra na loja permanente ou em um evento.
2. A API da Vercel coloca um trabalho na fila privada do seller.
3. Este serviço busca e reserva o trabalho.
4. Gera as vias de produção e cliente em PDF de 80 mm.
5. Envia cada via para a fila local de impressão.
6. Confirma o trabalho e evita duplicações no mesmo computador.

Nenhuma chave do Firebase Admin é instalada. O computador recebe apenas uma chave revogável da estação de impressão.

## Windows

Leia [README-WINDOWS.md](README-WINDOWS.md).

Configuração rápida:

```text
scripts\setup-windows.cmd
scripts\install-windows.cmd
```

## macOS

Leia [README-MACOS.md](README-MACOS.md).

## Modo preview

Crie `.env`, mantenha `PRINT_MODE=preview` e execute:

```bash
npm run doctor
npm start
```

Os PDFs serão salvos em `output/` sem enviar nada à impressora.

## Comandos

```bash
npm start        # serviço contínuo
npm run once     # processa no máximo um trabalho
npm run doctor   # valida configuração, impressora e API
npm run printers # lista impressoras instaladas no Windows
```

## Segurança

Se a chave da estação vazar ou o computador for substituído, use **Substituir chave de conexão** no painel. A chave anterior deixa de funcionar imediatamente.
