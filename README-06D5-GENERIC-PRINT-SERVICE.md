# 06D5 — Print Service genérico e perfis de impressora

Esta etapa transforma a configuração única de impressão em perfis independentes por seller, estação e impressora. O mesmo seller pode manter cozinha, balcão, expedição e contingência com conexões e vias diferentes.

## Estrutura no Firestore

A configuração continua em:

```text
sellers/{sellerId}/settings/printing
```

com `schemaVersion: 2`:

```ts
{
  enabled: true,
  profiles: [
    {
      id: "printer_...",
      name: "Cozinha",
      stationName: "Mini PC da cozinha",
      enabled: true,
      autoPrint: true,
      copies: "production",
      connectionMode: "tcp",
      networkHost: "192.168.1.80",
      networkPort: 9100,
      paperWidthMm: 80,
      dpi: 203,
      dotsPerLine: 576,
      intensity: 55,
      useAdvancedThreshold: false,
      rasterThreshold: 168,
      cutAfterPrint: true,
      feedLines: 4,
      copyDelayMs: 1000,
      tokenHash: "...",
      tokenPrefix: "ps_..."
    }
  ]
}
```

O estado de conexão fica separado em:

```text
sellers/{sellerId}/printStations/{profileId}
```

A chave completa nunca é salva no Firestore. Somente o hash e um pequeno prefixo de identificação são armazenados.

## Perfis e destinos

Cada perfil configura:

- nome do perfil e da estação;
- ativo/inativo;
- impressão automática;
- via de produção, via do cliente ou ambas;
- papel de 58 ou 80 mm;
- resolução e pontos por linha;
- corte e avanço de papel;
- intervalo entre vias;
- conexão e destino;
- chave exclusiva da estação.

Até 12 perfis podem ser cadastrados por seller.

### Modos de conexão

- `preview`: gera PDF em `print-service/output`, sem enviar à impressora;
- `windows`: gera PDF e envia à fila instalada no Windows por SumatraPDF;
- `cups`: gera PDF e envia à fila CUPS no macOS ou Linux;
- `tcp`: renderiza o recibo como raster monocromático ESC/POS e envia diretamente ao IP/porta da impressora;
- `local`: modo de compatibilidade para instalações anteriores à 06D5, mantendo a configuração no `.env` local.

USB usa normalmente o driver/fila do Windows ou CUPS. Ethernet pode usar a fila do sistema ou TCP/IP direto, normalmente na porta `9100`.

## Intensidade e raster ESC/POS

No modo TCP/IP direto, o recibo é renderizado localmente e convertido em comandos ESC/POS sem dependências nativas adicionais.

O perfil oferece:

- controle amigável de intensidade entre 0 e 100;
- limiar raster avançado entre 1 e 254;
- pontos por linha configuráveis;
- resolução configurável;
- corte e avanço;
- processamento em faixas para recibos longos.

O controle amigável altera o limiar usado na conversão para preto e branco. Isso permite adaptar contraste a diferentes impressoras, papéis e condições da cabeça térmica sem mudar a composição do recibo.

## Fila direcionada por perfil

Cada pedido novo cria um trabalho separado para cada perfil que esteja:

- ativo;
- configurado com chave;
- com impressão automática habilitada.

O trabalho recebe `profileId` e uma `queueKey` específica. Uma estação só consegue autenticar e retirar trabalhos do próprio perfil.

A fila possui:

- lease de dois minutos durante a impressão;
- reenfileiramento de trabalhos abandonados;
- até oito tentativas;
- confirmação idempotente local para reduzir reimpressões após falha de rede;
- estados `pending`, `printing`, `printed` e `failed` por perfil.

Se a impressão global estiver desativada, a estação continua conseguindo fazer heartbeat e aparecer no painel, mas novos pedidos não entram nas filas automáticas.

## Painel do seller

Em `/seller/settings`, o card **Print Service e perfis de impressora** permite:

- criar, editar e excluir perfis;
- escolher o modo de conexão;
- informar fila, IP e porta;
- escolher vias e largura;
- ajustar intensidade, limiar, resolução, corte e intervalo;
- gerar ou substituir a chave individual;
- copiar o bloco mínimo do `.env`;
- enviar impressão de teste;
- conferir sistema, arquitetura, última conexão, última impressão e último erro.

A atualização automática do status não sobrescreve campos que o seller esteja editando.

## Print Service 2.0

A pasta `print-service` foi atualizada para uma base neutra, sem nome comercial fixo e sem dependências npm externas.

Configuração mínima:

```env
PRINT_BASE_URL=https://seu-dominio.example
PRINT_SELLER_ID=SEU_SELLER_ID
PRINT_PROFILE_ID=printer_xxxxxxxxxxxxxx
PRINT_STATION_TOKEN=ps_SUA_CHAVE
PRINT_STATION_NAME=Cozinha
```

O modo, a impressora, o IP, o papel e os ajustes são sincronizados do perfil online.

Comandos:

```bash
npm run doctor
npm run printers
npm run print-test
npm start
npm run once
```

Documentação por sistema:

- `print-service/README-WINDOWS.md`;
- `print-service/README-MACOS.md`;
- `print-service/README-LINUX.md`.

Windows usa uma tarefa agendada por Profile ID. macOS usa um LaunchAgent por Profile ID. Linux/ARM usa uma unidade systemd de usuário por Profile ID e tenta habilitar `linger` para permanecer ativo após logout ou reinício.

Para usar mais de um perfil no mesmo computador, mantenha uma cópia separada da pasta `print-service` para cada perfil. Cada cópia terá seu próprio `.env`, estado, logs e processo automático.

## Rede da impressora LAN

O computador ou mini PC deve continuar conectado normalmente ao roteador que fornece internet. A impressora deve ficar na mesma rede local, com um IP estável.

Recomendação geral:

1. conecte a impressora ao roteador/switch, não como substituta da conexão normal do computador;
2. descubra o IP atribuído à impressora;
3. reserve esse IP no DHCP do roteador ou configure um IP fixo livre na mesma sub-rede;
4. não altere o gateway padrão do computador para o IP da impressora;
5. teste o IP e a porta pelo `npm run doctor`.

Isso evita o comportamento em que a impressão funciona, mas o computador perde acesso à internet.

## Compatibilidade

- A configuração única anterior é migrada em memória para o perfil `legacy` quando já existe uma chave.
- O serviço antigo, que ainda não envia `profileId`, continua conseguindo operar quando há somente o perfil legado.
- Variáveis antigas `YAMADA_*` de URL, seller, token e estação continuam aceitas somente para migração.
- Trabalhos antigos sem `profileId` podem ser retirados pela fila `legacy`.
- Não houve alteração nas Firestore Rules nem nas Cloud Functions.

## Instalação do patch

Na raiz do projeto:

```bash
unzip -o yamada-06D5-generic-print-service-profiles.zip -d .
rm -rf .next
npm install
npm run audit:white-label
npm run build
```

Depois publique o Next.js pelo fluxo habitual.

O Print Service é instalado separadamente no computador que ficará perto da impressora. Entre em `/seller/settings`, crie o perfil, gere a chave e siga o README do sistema operacional.

## Checklist rápido

1. Abra `/seller/settings` e crie um perfil em modo `preview`.
2. Gere a chave e configure `.env` em `print-service`.
3. Execute `npm run doctor` e `npm run print-test`.
4. Instale a inicialização automática do sistema operacional.
5. Confirme que o perfil aparece online no painel.
6. Envie o teste pelo painel.
7. Configure uma fila Windows/CUPS ou mude para TCP/IP.
8. Faça um pedido real e confira o trabalho em `sellers/{sellerId}/printJobs`.
9. Teste perfis com vias diferentes.
10. No modo TCP, ajuste intensidade e limiar conforme o papel e a impressora.
