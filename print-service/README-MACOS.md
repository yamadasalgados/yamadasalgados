# Print Service no macOS

1. Instale Node.js 20 ou superior e Chrome/Edge.
2. Para CUPS, instale a impressora e confirme a fila com `lpstat -p`.
3. Crie o perfil no painel e gere a chave.
4. Crie `.env` com `PRINT_BASE_URL`, `PRINT_SELLER_ID`, `PRINT_PROFILE_ID`, `PRINT_STATION_TOKEN` e `PRINT_STATION_NAME`.
5. Execute:

```bash
npm install
npm run doctor
npm run print-test
./scripts/install-macos.sh
```

O mesmo serviço funciona em Macs Intel e Apple Silicon. Perfis TCP/IP ESC/POS não exigem fila CUPS, apenas acesso ao IP/porta da impressora.
