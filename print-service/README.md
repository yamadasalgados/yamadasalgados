# Order Print Service 2.0

Serviço local gratuito e white-label para imprimir automaticamente os pedidos de cada seller. Um mesmo seller pode manter vários perfis independentes, por exemplo cozinha, balcão, expedição e uma impressora de contingência.

## Sistemas e conexões suportados

- Windows 10/11, x64 ou ARM64: fila/driver do Windows com SumatraPDF.
- macOS Intel ou Apple Silicon: CUPS.
- Linux x64/ARM, incluindo Raspberry Pi: CUPS ou TCP/IP direto.
- Impressora LAN ESC/POS: conexão raw TCP, normalmente porta `9100`, sem driver.
- Modo `preview`: somente gera os arquivos em `output/`.

USB funciona pela fila instalada no Windows/CUPS. Ethernet pode funcionar pela fila do sistema ou diretamente por TCP/IP.

## Configuração mínima

Crie o perfil em **Seller > Configurações > Print Service e perfis de impressora**, gere a chave e coloque no arquivo `.env`:

```env
PRINT_BASE_URL=https://seu-dominio.example
PRINT_SELLER_ID=SEU_SELLER_ID
PRINT_PROFILE_ID=printer_xxxxxxxxxxxxxx
PRINT_STATION_TOKEN=ps_SUA_CHAVE
PRINT_STATION_NAME=Cozinha
```

O modo de conexão, impressora, IP, largura do papel, vias, intensidade e corte são sincronizados do perfil online. A chave é exclusiva daquele perfil e pode ser revogada sem afetar as outras impressoras.

## Comandos

```bash
npm run doctor      # valida perfil, sistema, API e conexão
npm run printers    # lista filas do Windows ou CUPS
npm run print-test  # teste local usando o perfil online
npm start           # serviço contínuo
npm run once        # processa no máximo um trabalho
```

O serviço não precisa de Firebase Admin nem de credenciais do seller. Ele recebe apenas trabalhos destinados ao seu `PRINT_PROFILE_ID`.

## Impressão TCP/IP ESC/POS

O recibo é renderizado pelo Chrome/Edge/Chromium, convertido localmente para raster monocromático e enviado à impressora via TCP. O perfil permite controlar:

- IP/host e porta;
- 58 ou 80 mm;
- pontos por linha, normalmente 384 para 58 mm e 576 para 80 mm;
- intensidade/contraste amigável;
- limiar raster avançado;
- avanço e corte após cada via.

A MUNBYN ITPP072 pode usar o modo Windows/CUPS quando instalada por driver ou o modo TCP/IP direto quando a interface LAN aceitar ESC/POS raw na porta configurada.

## Inicialização automática

- Windows: veja [README-WINDOWS.md](README-WINDOWS.md).
- macOS: veja [README-MACOS.md](README-MACOS.md).
- Linux/Raspberry Pi: veja [README-LINUX.md](README-LINUX.md).

## Compatibilidade

Variáveis antigas `YAMADA_*` e a configuração única anterior continuam sendo lidas durante a migração. Perfis novos usam somente os nomes neutros `PRINT_*`.
