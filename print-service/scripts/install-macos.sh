#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || { echo "Arquivo $ENV_FILE não encontrado."; exit 1; }
PROFILE_ID="$(grep -E '^PRINT_PROFILE_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' || true)"
PROFILE_ID="${PROFILE_ID:-legacy}"
SAFE_PROFILE="$(printf '%s' "$PROFILE_ID" | tr -cs 'A-Za-z0-9_.-' '_')"
LABEL="com.order-platform.print-service.$SAFE_PROFILE"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LEGACY_PLISTS=(
  "$HOME/Library/LaunchAgents/com.order-platform.print-service.plist"
  "$HOME/Library/LaunchAgents/com.yamada.print-service.plist"
)
LOG_DIR="$ROOT/logs"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cd "$ROOT"
npm install --omit=dev

for LEGACY in "${LEGACY_PLISTS[@]}"; do
  launchctl bootout "gui/$(id -u)" "$LEGACY" 2>/dev/null || true
  rm -f "$LEGACY"
done

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$ROOT/src/index.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/output.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/error.log</string>
</dict></plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "Order Print Service instalado para o perfil $PROFILE_ID."
echo "Logs: $LOG_DIR"
