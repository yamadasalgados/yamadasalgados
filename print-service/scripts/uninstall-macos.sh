#!/bin/bash
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.yamada.print-service.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Yamada Print Service removido do início automático."
