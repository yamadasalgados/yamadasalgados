# 06D1 — Base white-label e identidade do seller

Este pacote reconstrói a primeira etapa do roadmap sobre a versão enviada do projeto.
Ele é um **patch incremental**: substitui somente os arquivos listados em `MANIFEST-06D1.json`.

## O que foi implementado

### Identidade configurável por seller

Em `/seller/settings`, o seller passa a configurar:

- nome comercial público;
- descrição da loja;
- logo;
- banner/capa;
- cor principal e cor de contraste;
- telefone, e-mail, WhatsApp, Instagram e site;
- texto-base superior e inferior para o futuro recibo personalizado da 06D6.

Os dados ficam no documento:

```text
sellers/{sellerId}
```

Campos principais:

```text
identitySchemaVersion: 1
storeName
storeDescription
logoUrl
bannerUrl
brandPrimaryColor
brandAccentColor
contact.phone
contact.email
contact.whatsapp
contact.instagram
contact.website
receiptIdentity.headerText
receiptIdentity.footerText
```

O campo antigo `whatsapp` continua sendo atualizado como espelho temporário para compatibilidade com telas existentes.

### Upload de identidade

Foram adicionados uploads separados em Firebase Storage:

```text
sellers/{sellerId}/branding/logo/**
sellers/{sellerId}/branding/banner/**
```

Limites:

- logo: 5 MB;
- banner: 10 MB;
- formatos: JPG/JPEG, PNG, WebP e GIF.

O pacote também inclui `storage.rules` e adiciona essa regra ao `firebase.json`.

### Aplicação da identidade

A identidade passa a ser usada em:

- navegação do painel do seller;
- navegação da loja pública;
- navegação da área do cliente vinculada à loja;
- cabeçalho principal da loja permanente;
- cabeçalho dos eventos públicos;
- perfil regional carregado pela sessão do seller;
- onboarding, preservando campos existentes ao concluir o cadastro.

A remoção completa de nomes, logos, manifests, metadados e textos fixos pertence à **06D2** e não foi misturada nesta etapa.

## Instalação

Na raiz de `yamada-landing`, crie um checkpoint:

```bash
git add -A
git commit -m "checkpoint antes da 06D1 white-label"
```

Coloque o ZIP na raiz e aplique:

```bash
unzip -o yamada-06D1-white-label-recriada.zip -d .
```

Instale dependências caso necessário e valide:

```bash
rm -rf .next
npm run build
```

Depois publique as regras:

```bash
firebase deploy --only firestore:rules,storage
```

## Testes recomendados

1. Entre com uma conta seller e abra `/seller/settings`.
2. Salve nome, descrição e cores sem enviar imagens.
3. Atualize a página e confirme que os dados permaneceram.
4. Envie um logo e um banner válidos.
5. Abra `/store/{sellerId}` e confira nome, descrição, logo, banner e cores.
6. Abra um evento público do seller e confira a identidade acima do título.
7. Confirme que a navegação do seller mostra o logo ou as iniciais da loja.
8. Teste uma conta seller antiga que ainda tenha somente `storeName` e `whatsapp`.
9. Teste tema claro e escuro, celular e desktop.

## Observações

- Remover uma imagem na tela limpa a URL pública, mas não apaga automaticamente arquivos antigos do Storage. Uma rotina de limpeza poderá ser adicionada depois.
- Metadados do navegador, manifest PWA, push, compartilhamento e todos os nomes fixos serão tratados na 06D2.
- A composição final e as opções de QR Code do recibo permanecem reservadas para a 06D6.
