# Print Service no Windows

## Requisitos

- Windows 10 ou 11, inclusive ARM64 quando Node.js e o navegador estiverem disponíveis para a arquitetura;
- Node.js 20 ou superior;
- Chrome ou Edge;
- para perfil **Windows driver**, impressora instalada no Windows e SumatraPDF;
- para perfil **TCP/IP ESC/POS**, acesso de rede ao IP/porta da impressora; SumatraPDF não é necessário.

## Instalação

1. No painel do seller, crie o perfil e configure a conexão.
2. Gere a chave do perfil.
3. Dentro de `print-service`, execute:

```text
scripts\setup-windows.cmd
```

Informe URL, Seller ID, Profile ID, chave e nome da estação. O assistente salva `.env`, executa `npm install` e roda o diagnóstico.

Depois execute:

```text
scripts\install-windows.cmd
```

O serviço inicia no login pelo Agendador de Tarefas.

## Diagnóstico

```powershell
npm run printers
npm run doctor
npm run print-test
npm run once
```

Para conexão por driver, copie para o perfil online o nome exato mostrado por `npm run printers`. Para LAN direta, configure no painel o IP e normalmente a porta `9100`.

## Logs e remoção

```text
scripts\status-windows.cmd
scripts\uninstall-windows.cmd
```

Logs: `logs\output.log` e `logs\error.log`.

## Papel e corte

No modo Windows driver, largura, orientação e corte também dependem das preferências do driver. No modo TCP/IP, largura, rasterização, avanço e corte são controlados pelo perfil online.
