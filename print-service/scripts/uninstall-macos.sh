#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
PROFILE_ID="$(grep -E '^PRINT_PROFILE_ID=' "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' || true)"
PROFILE_ID="${PROFILE_ID:-legacy}"
SAFE_PROFILE="$(printf '%s' "$PROFILE_ID" | tr -cs 'A-Za-z0-9_.-' '_')"
PLISTS=(
  "$HOME/Library/LaunchAgents/com.order-platform.print-service.$SAFE_PROFILE.plist"
  "$HOME/Library/LaunchAgents/com.order-platform.print-service.plist"
  "$HOME/Library/LaunchAgents/com.yamada.print-service.plist"
)
for PLIST in "${PLISTS[@]}"; do
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
done
echo "Order Print Service removido do início automático."
