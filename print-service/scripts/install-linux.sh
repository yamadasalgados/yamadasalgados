#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || { echo "Arquivo $ENV_FILE não encontrado."; exit 1; }
PROFILE_ID="$(grep -E '^PRINT_PROFILE_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' || true)"
PROFILE_ID="${PROFILE_ID:-legacy}"
SAFE_PROFILE="$(printf '%s' "$PROFILE_ID" | tr -cs 'A-Za-z0-9_.-' '_')"
SERVICE_NAME="order-print-service-$SAFE_PROFILE"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/$SERVICE_NAME.service"

mkdir -p "$SERVICE_DIR" "$ROOT/logs"
cd "$ROOT"
npm install --omit=dev

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Order Print Service ($PROFILE_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$NODE_BIN $ROOT/src/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
SERVICE

if command -v loginctl >/dev/null 2>&1; then
  if ! loginctl enable-linger "$USER" >/dev/null 2>&1; then
    echo "Aviso: não foi possível ativar linger automaticamente."
    echo "Para manter o serviço ativo após logout/reinício, execute: sudo loginctl enable-linger \"$USER\""
  fi
fi

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME.service"
echo "Order Print Service instalado para o perfil $PROFILE_ID."
echo "Serviço: $SERVICE_NAME.service"
systemctl --user --no-pager status "$SERVICE_NAME.service" || true
