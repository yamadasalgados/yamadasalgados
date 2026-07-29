# 06D6 — Recibo personalizado com logo, conferência e QR Code

Patch incremental para a base que já contém as etapas 06D1 a 06D5.

## Recursos adicionados

### Configuração separada por via

Em `/seller/settings`, o seller passa a configurar independentemente:

- via do seller/produção;
- via do cliente.

Para cada via é possível escolher:

- mostrar ou ocultar o logo da identidade white-label;
- mostrar ou ocultar o texto de cabeçalho;
- mostrar ou ocultar o texto de rodapé;
- ativar uma marca de conferência antes de cada produto;
- escolher o estilo `□`, `[ ]`, `○` ou `____`;
- ativar ou desativar QR Code;
- definir o destino e o texto exibido abaixo do QR Code.

Os textos e o logo continuam sendo editados no card **Identidade white-label**.

### Destinos do QR Code

Cada via pode apontar para:

- detalhe do pedido no painel do seller;
- acompanhamento do pedido pelo cliente;
- página pública da loja;
- link personalizado `http://` ou `https://`.

Quando o pedido não está ligado a uma conta de cliente, o destino de acompanhamento usa a página pública da loja como fallback seguro.

### Impressão automática e pré-visualização

As opções são respeitadas em ambos os fluxos:

- diálogo de impressão manual do painel de produção;
- Print Service 2.1, inclusive PDF, Windows, CUPS e TCP/IP ESC/POS raster.

O trabalho enviado à estação contém um snapshot da identidade e da configuração de cada via. A estação não precisa acessar o Firestore diretamente.

### QR Code sem dependência externa

Foi incluído um gerador interno de QR Code em SVG:

- modo byte UTF-8;
- correção de erro nível L;
- versões 1 a 10;
- limite de 260 bytes por destino;
- sem API de terceiros;
- sem inclusão de novas dependências no `package.json`.

### Link da loja no evento

A página pública do evento agora exibe claramente **Conheça a loja**, apontando para a loja permanente do seller. O mesmo texto é usado após a conclusão do pedido.

## Estrutura salva

As configurações ficam em:

```text
sellers/{sellerId}/settings/receipt
```

Exemplo simplificado:

```ts
{
  schemaVersion: 1,
  production: {
    showLogo: true,
    showHeaderText: true,
    showFooterText: false,
    checkboxEnabled: true,
    checkboxStyle: "square",
    qrEnabled: true,
    qrDestination: "seller_order",
    qrCustomUrl: "",
    qrLabel: "Abrir pedido no painel"
  },
  customer: {
    showLogo: true,
    showHeaderText: true,
    showFooterText: true,
    checkboxEnabled: false,
    checkboxStyle: "square",
    qrEnabled: true,
    qrDestination: "customer_tracking",
    qrCustomUrl: "",
    qrLabel: "Acompanhar pedido"
  }
}
```

A gravação e a leitura usam uma API autenticada pelo seller. Não é necessária alteração nas Firestore Rules.

## Instalação

Na raiz do projeto:

```bash
git add -A
git commit -m "checkpoint antes da 06D6"
unzip -o yamada-06D6-personalized-receipts-qr.zip -d .
npm install
npm run audit:white-label
rm -rf .next
npm run build
```

Depois, publique normalmente na Vercel.

Não houve alteração nas Cloud Functions, Firestore Rules ou Storage Rules nesta etapa.

## Atualização das estações de impressão

O patch altera `print-service/src/receipt.mjs`. Atualize a pasta do Print Service em cada computador/mini PC e reinicie o serviço.

### Windows

Na pasta `print-service` atualizada:

```text
scripts\install-windows.cmd
```

### macOS

```bash
chmod +x scripts/install-macos.sh
./scripts/install-macos.sh
```

### Linux ou Raspberry Pi

```bash
chmod +x scripts/install-linux.sh
./scripts/install-linux.sh
```

O `.env` existente não é substituído por este patch.

## Teste recomendado

1. Abra `/seller/settings`.
2. Configure a via de produção e a via do cliente.
3. Ative inicialmente o QR da página da loja.
4. Salve.
5. Execute uma impressão de teste em um perfil no modo Preview/PDF.
6. Leia o QR com o celular.
7. Confirme logo, cabeçalho, rodapé e caixa de conferência.
8. Depois teste na impressora física.

## Compatibilidade

Sellers sem configuração de recibo usam valores padrão:

- logo e cabeçalho ativos nas duas vias;
- caixa de conferência ativa somente na via de produção;
- rodapé ativo somente na via do cliente;
- QR Code desativado até o seller habilitá-lo.

## Próximas etapas registradas

- **06D7 — Preços programados e avisos comerciais.**
- **06D8 — Créditos manuais, presentes de pontos e repasse dos pontos gerados por evento.** O seller poderá escolher a conta beneficiada, informar motivo e valor e manter histórico auditável, com proteção contra repasse duplicado.
