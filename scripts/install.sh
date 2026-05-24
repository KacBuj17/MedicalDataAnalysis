#!/usr/bin/env bash
# install.sh — buduje obrazy Docker (w tym generuje zaszyfrowaną bazę danych)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║  MedAnalytics HE — Instalacja Docker         ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${RESET}"
echo

# Sprawdź czy docker jest dostępny
if ! command -v docker &>/dev/null; then
    echo "❌  Docker nie jest zainstalowany lub nie jest w PATH."
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "❌  Docker daemon nie działa. Uruchom Docker Desktop."
    exit 1
fi

echo -e "${BOLD}Etap 1/4${RESET} — Budowanie: data-builder"
echo -e "         ${YELLOW}(generowanie próbnych danych + szyfrowanie CKKS)${RESET}"
echo -e "         ${YELLOW}To może zająć kilka minut — tenseal jest dużą biblioteką.${RESET}"
echo

echo -e "${BOLD}Etap 2/4${RESET} — Budowanie: compute_server  (Flask :5002)"
echo -e "${BOLD}Etap 3/4${RESET} — Budowanie: doctor_backend  (Flask :5001)"
echo -e "${BOLD}Etap 4/4${RESET} — Budowanie: frontend         (React → nginx :3000)"
echo

docker compose build --no-cache

echo
echo -e "${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅  Budowanie zakończone!                    ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo
echo -e "  Uruchom projekt:  ${BOLD}./scripts/run.sh${RESET}"
