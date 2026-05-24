#!/usr/bin/env bash
# stop.sh — zatrzymuje kontenery (bez usuwania)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RESET='\033[0m'

echo -e "${CYAN}MedAnalytics HE — Zatrzymywanie...${RESET}"
docker compose stop
echo -e "${GREEN}✅  Kontenery zatrzymane.${RESET}"
echo
echo "Wznów:     ./scripts/run.sh"
echo "Usuń:      ./scripts/uninstall.sh"
