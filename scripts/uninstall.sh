#!/usr/bin/env bash
# uninstall.sh — usuwa kontenery, obrazy i sieć Docker
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║  MedAnalytics HE — Deinstalacja              ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo

echo -e "${YELLOW}Zostaną usunięte:${RESET}"
echo "  • kontenery: medical_compute_server, medical_doctor_backend, medical_frontend"
echo "  • obrazy:    medical-he/compute_server, medical-he/doctor_backend, medical-he/frontend"
echo "  • sieć:      medical_he_network"
echo

read -r -p "Czy na pewno chcesz usunąć wszystko? [y/N] " reply
echo

if [[ "${reply,,}" =~ ^y$ ]]; then
    echo "Zatrzymywanie i usuwanie kontenerów..."
    docker compose down --rmi all --remove-orphans

    # Usuń też builder cache dla tego projektu
    echo "Czyszczenie cache buildów..."
    docker builder prune -f --filter "label=com.docker.compose.project=medical-he" 2>/dev/null || true

    echo
    echo -e "${GREEN}✅  Deinstalacja zakończona.${RESET}"
    echo -e "   Aby zainstalować ponownie: ${BOLD}./scripts/install.sh${RESET}"
else
    echo "Anulowano."
fi
