# Print Service no Linux e ARM

Compatível com distribuições que tenham Node.js 20+ e Chrome/Chromium, incluindo Raspberry Pi.

## Dependências usuais

```bash
sudo apt update
sudo apt install -y chromium cups nodejs npm
```

Confirme que a versão do Node é 20 ou superior. Para CUPS, configure a fila e teste `lpstat -p`. Para TCP/IP ESC/POS, basta que o equipamento alcance o IP/porta da impressora.

## Instalação

Crie `.env` usando os valores gerados pelo perfil no painel e execute:

```bash
npm install
npm run doctor
npm run print-test
chmod +x scripts/install-linux.sh
./scripts/install-linux.sh
```

Status e logs (o instalador mostra o nome completo, que inclui o Profile ID):

```bash
systemctl --user --type=service | grep order-print-service
systemctl --user status order-print-service-PRINT_PROFILE_ID.service
journalctl --user -u order-print-service-PRINT_PROFILE_ID.service -f
```

Remoção:

```bash
./scripts/uninstall-linux.sh
```

O instalador tenta ativar `linger` para manter o serviço ligado após logout e reinício. Caso apareça um aviso, execute uma vez:

```bash
sudo loginctl enable-linger "$USER"
```
