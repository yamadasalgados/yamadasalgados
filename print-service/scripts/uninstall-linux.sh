#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
PROFILE_ID="$(grep -E '^PRINT_PROFILE_ID=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' || true)"
PROFILE_ID="${PROFILE_ID:-legacy}"
SAFE_PROFILE="$(printf '%s' "$PROFILE_ID" | tr -cs 'A-Za-z0-9_.-' '_')"
SERVICE_NAME="order-print-service-$SAFE_PROFILE"
systemctl --user disable --now "$SERVICE_NAME.service" 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
systemctl --user daemon-reload
echo "Order Print Service removido da inicialização automática."
