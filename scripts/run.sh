#!/usr/bin/env bash
# run.sh — uruchamia wszystkie kontenery w tle
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║  MedAnalytics HE — Uruchamianie              ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo

# Sprawdź czy obrazy istnieją
if ! docker image inspect medical-he/compute_server:latest &>/dev/null; then
    echo -e "${YELLOW}⚠  Obrazy nie zostały jeszcze zbudowane.${RESET}"
    echo -e "   Uruchom najpierw: ${BOLD}./scripts/install.sh${RESET}"
    exit 1
fi

echo "Uruchamianie kontenerów..."
docker compose up -d

echo
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅  Serwisy uruchomione!                         ║${RESET}"
echo -e "${GREEN}╠══════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}║  🌐  Frontend:        http://localhost:3000        ║${RESET}"
echo -e "${GREEN}║  🔌  Doctor Backend:  http://localhost:5001        ║${RESET}"
echo -e "${GREEN}║  🖥  Compute Server:  http://localhost:5002        ║${RESET}"
echo -e "${GREEN}╠══════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}║  👨‍⚕️  Login:   dr_kowalski                          ║${RESET}"
echo -e "${GREEN}║  🔑  Hasło:   Doctor123!                           ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${RESET}"
echo

echo "Status kontenerów:"
docker compose ps

echo
echo -e "Logi:   ${BOLD}docker compose logs -f${RESET}"
echo -e "Stop:   ${BOLD}./scripts/stop.sh${RESET}"
