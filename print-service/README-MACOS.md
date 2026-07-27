# Yamada Print Service no macOS

A configuração original do macOS continua disponível.

1. Instale o driver e adicione a impressora.
2. Copie `.env.example` para `.env`.
3. Use `PRINT_MODE=cups` e o nome retornado por `lpstat -p`.
4. Execute `npm run doctor`.
5. Instale a inicialização automática com `./scripts/install-macos.sh`.
