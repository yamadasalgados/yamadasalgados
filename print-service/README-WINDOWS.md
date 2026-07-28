# Yamada Print Service no Windows

A versão Windows usa:

- Chrome ou Edge para gerar o recibo de 80 mm em PDF;
- SumatraPDF para enviar o PDF silenciosamente à impressora escolhida;
- a fila normal de impressão do Windows;
- o Agendador de Tarefas para iniciar automaticamente ao entrar no computador.

A impressora pode estar conectada por USB ou LAN. Para LAN, basta que ela esteja instalada no Windows e acessível pela mesma rede.

## Requisitos

1. Windows 10 ou 11.
2. Node.js 20 ou superior.
3. Google Chrome ou Microsoft Edge.
4. Driver da MUNBYN instalado e impressora adicionada em **Configurações > Bluetooth e dispositivos > Impressoras e scanners**.
5. SumatraPDF instalado, ou a versão portátil colocada em:

```text
tools\SumatraPDF.exe
```

O programa não inclui o executável do SumatraPDF. Baixe apenas do site oficial.

## Configuração guiada

No painel do seller, abra **Configurações > Impressão automática**, gere a chave e mantenha essa tela disponível.

Dentro da pasta `print-service`, dê dois cliques em:

```text
scripts\setup-windows.cmd
```

O assistente solicitará:

- seller ID;
- chave da estação;
- nome do computador;
- impressora instalada.

Ele cria o `.env` e executa o diagnóstico.

## Teste antes da impressão automática

Abra o Terminal/PowerShell na pasta `print-service`:

```powershell
npm run printers
npm run doctor
npm run print-test
npm run once
```

Envie uma impressão de teste pelo painel. Em `PRINT_MODE=windows`, o recibo será impresso. Os PDFs também ficam salvos em `output\`.

## Iniciar automaticamente

Dê dois cliques em:

```text
scripts\install-windows.cmd
```

O serviço será registrado no Agendador de Tarefas e começará ao entrar no Windows.

## Verificar status e logs

```text
scripts\status-windows.cmd
```

Logs:

```text
logs\output.log
logs\error.log
```

## Remover da inicialização

```text
scripts\uninstall-windows.cmd
```

A remoção da tarefa não apaga `.env`, PDFs ou histórico local.

## Configuração manual do `.env`

```env
YAMADA_BASE_URL=https://yamadasalgados.vercel.app
YAMADA_SELLER_ID=SEU_SELLER_ID
YAMADA_PRINT_TOKEN=SUA_CHAVE
YAMADA_STATION_NAME=PC da cozinha

PRINT_MODE=windows
PRINTER_NAME=MUNBYN Receipt Printer
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
SUMATRA_PATH=C:\Users\SEU_USUARIO\AppData\Local\SumatraPDF\SumatraPDF.exe
WINDOWS_PRINT_SETTINGS=fit
WINDOWS_PRINT_TIMEOUT_MS=60000
COPY_DELAY_MS=1000
```

Use o nome exato exibido por:

```powershell
npm run printers
```

## Papel e corte

Configure no driver da MUNBYN:

- largura de 80 mm;
- orientação retrato;
- corte automático após cada trabalho;
- margens mínimas ou zero, quando disponíveis.

Cada via é enviada como um trabalho separado. `COPY_DELAY_MS` cria uma pequena pausa entre as vias para favorecer o corte automático.


## Erro código 1 do SumatraPDF

A versão 1.2 do serviço registra a versão do SumatraPDF, confirma se ele reconhece a impressora e tenta novamente sem opções avançadas quando o código 1 aparece. Para isolar o computador da fila online, execute:

```powershell
npm run doctor
npm run print-test
```

O segundo comando gera e imprime um papel de teste local. Se ele falhar, o log mostra impressora, porta, driver, versão do SumatraPDF e se a impressora aparece em `-list-printers`.
