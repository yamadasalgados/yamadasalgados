#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"

say() { echo -e "\n\033[1;36m==>\033[0m $1"; }
mk() { mkdir -p "$1"; }
mv_if() { if [ -e "$1" ]; then say "Movendo: $1 -> $2"; mk "$(dirname "$2")"; mv "$1" "$2"; else say "Ignorado (não existe): $1"; fi }
cp_if() { if [ -e "$1" ]; then say "Copiando: $1 -> $2"; mk "$(dirname "$2")"; cp -R "$1" "$2"; else say "Ignorado (não existe): $1"; fi }

say "1) Criando estrutura /seller e /admin"
mk "app/seller"
mk "app/seller/events"
mk "app/seller/events/[id]"
mk "app/seller/orders"
mk "app/seller/entregas"
mk "app/seller/products"

mk "app/admin"
mk "app/admin/sellers"
mk "app/admin/plans"
mk "app/admin/events"
mk "app/admin/settings"

say "2) Movendo rotas atuais para /seller (se existirem)"
mv_if "app/dashboard/page.tsx" "app/seller/page.tsx"
mv_if "app/dashboard/events/[id]/page.tsx" "app/seller/events/[id]/page.tsx"

# Se você tiver mais arquivos dentro de app/dashboard, movemos para app/seller/legacy para não perder nada
if [ -d "app/dashboard" ]; then
  say "Encontrado app/dashboard (restante). Movendo para app/seller/legacy-dashboard/"
  mk "app/seller/legacy-dashboard"
  shopt -s dotglob
  mv app/dashboard/* app/seller/legacy-dashboard/ || true
  shopt -u dotglob
  rmdir app/dashboard 2>/dev/null || true
fi

mv_if "app/entregas/page.tsx" "app/seller/entregas/page.tsx"
mv_if "app/products/page.tsx" "app/seller/products/page.tsx"

say "3) Criando páginas vazias (stubs) para completar o fluxo"
create_stub () {
  local path="$1"
  local title="$2"
  if [ ! -f "$path" ]; then
    say "Criando stub: $path"
    mk "$(dirname "$path")"
    cat > "$path" <<EOF
"use client";

export default function Page() {
  return (
    <main className="p-4 space-y-2">
      <h1 className="text-xl font-bold">${title}</h1>
      <p className="text-sm text-neutral-600">
        Página criada pela reestruturação. Vamos implementar agora.
      </p>
    </main>
  );
}
EOF
  else
    say "Stub já existe: $path"
  fi
}

create_stub "app/seller/events/page.tsx" "Seller • Eventos"
create_stub "app/seller/events/new/page.tsx" "Seller • Criar Evento"
create_stub "app/seller/orders/page.tsx" "Seller • Pedidos"
create_stub "app/admin/page.tsx" "Admin • Dashboard"
create_stub "app/admin/sellers/page.tsx" "Admin • Vendedores"
create_stub "app/admin/plans/page.tsx" "Admin • Planos"
create_stub "app/admin/events/page.tsx" "Admin • Eventos"
create_stub "app/admin/settings/page.tsx" "Admin • Configurações"

say "4) Garantindo .gitignore para functions/lib (build output)"
if [ -f ".gitignore" ]; then
  if ! grep -q "^functions/lib$" .gitignore; then
    echo "functions/lib" >> .gitignore
    say "Adicionado 'functions/lib' no .gitignore"
  else
    say ".gitignore já contém functions/lib"
  fi
else
  say "Criando .gitignore"
  cat > .gitignore <<'EOF'
node_modules
.next
dist
functions/lib
EOF
fi

say "5) (Opcional) Pasta de documentação interna"
mk "docs"
if [ ! -f "docs/README.md" ]; then
  cat > "docs/README.md" <<'EOF'
# Yamada Landing — Estrutura

- app/event/[id] -> Cliente (pedido)
- app/seller/*   -> Dashboard do vendedor
- app/admin/*    -> Painel do admin (você)

Próximos passos:
1) Auth/role guard
2) Firestore rules
3) Push subscriptions por sellerId + regionId
EOF
fi

say "✅ Reestruturação concluída."
say "Agora rode: npm run dev"
