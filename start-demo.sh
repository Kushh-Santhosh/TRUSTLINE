#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TrustLine — Demo startup script (M10.3)
#
# Brings up the full Docker Compose stack, waits for PostgreSQL to be healthy,
# runs database migrations, seeds demo data, then prints the app URLs.
#
# Usage:
#   ./start-demo.sh           # start stack + migrate + seed (default)
#   ./start-demo.sh --build   # force rebuild images before starting
#   ./start-demo.sh --reset   # tear down volumes, then start fresh
#
# Requirements:
#   - Docker with the Compose plugin (docker compose v2) or Docker Desktop
#   - backend/.env (copy from backend/.env.example):
#       cp backend/.env.example backend/.env  # then fill in JWT_SECRET etc.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[trustline]${RESET} $*"; }
success() { echo -e "${GREEN}[trustline]${RESET} ✅ $*"; }
warn()    { echo -e "${YELLOW}[trustline]${RESET} ⚠️  $*"; }
fatal()   { echo -e "${RED}[trustline]${RESET} ❌ $*" >&2; exit 1; }

# ── Banner ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ████████╗██████╗ ██╗   ██╗███████╗████████╗██╗     ██╗███╗   ██╗███████╗"
echo "     ██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝██║     ██║████╗  ██║██╔════╝"
echo "     ██║   ██████╔╝██║   ██║███████╗   ██║   ██║     ██║██╔██╗ ██║█████╗  "
echo "     ██║   ██╔══██╗██║   ██║╚════██║   ██║   ██║     ██║██║╚██╗██║██╔══╝  "
echo "     ██║   ██║  ██║╚██████╔╝███████║   ██║   ███████╗██║██║ ╚████║███████╗"
echo "     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝╚═╝  ╚═══╝╚══════╝"
echo -e "${RESET}"
echo -e "${BOLD}  TrustLine — High-Assurance Authentication Platform${RESET}"
echo ""

# ── Quick-exit flags (before prerequisite check) ───────────────────────────
for arg in "$@"; do
  case $arg in
    --help|-h)
      echo "Usage: $0 [--build] [--reset]"
      echo "  --build   Force rebuild Docker images"
      echo "  --reset   Destroy all volumes and start fresh (WARNING: deletes all data)"
      exit 0
      ;;
  esac
done

# ── Prerequisites check ────────────────────────────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  fatal "Docker is not installed. Install Docker Desktop from https://docker.com and try again."
fi

# Prefer 'docker compose' (v2 plugin) over 'docker-compose' (v1 standalone)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
  warn "Using docker-compose v1. Upgrade to Docker Compose v2 for best results."
else
  fatal "Docker Compose is not installed. Install Docker Desktop (includes Compose v2)."
fi

success "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
success "Compose: $($COMPOSE_CMD version --short 2>/dev/null || echo 'v1')"

# ── Backend environment guard ──────────────────────────────────────────────
# docker-compose.yml passes this exact file to the backend container.
if [[ ! -f "backend/.env" ]]; then
  warn "No backend/.env file found."
  warn "Creating it from backend/.env.example."
  warn "Edit backend/.env and set a real JWT_SECRET before a production deploy."
  cp backend/.env.example backend/.env
fi

# ── Parse arguments ────────────────────────────────────────────────────────
BUILD_FLAG=""
RESET=false

for arg in "$@"; do
  case $arg in
    --build) BUILD_FLAG="--build" ;;
    --reset) RESET=true ;;
    --help|-h)
      echo "Usage: $0 [--build] [--reset]"
      echo "  --build   Force rebuild Docker images"
      echo "  --reset   Destroy all volumes and start fresh (WARNING: deletes all data)"
      exit 0
      ;;
    *) fatal "Unknown argument: $arg  (use --help for usage)" ;;
  esac
done

# ── Reset (optional) ───────────────────────────────────────────────────────
if [[ "$RESET" == true ]]; then
  warn "Resetting — all PostgreSQL data will be erased."
  read -rp "  Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
  $COMPOSE_CMD down --volumes --remove-orphans
  info "Volumes removed."
fi

# ── Start containers ───────────────────────────────────────────────────────
info "Starting containers (this may take a moment on first run while images build)..."
# shellcheck disable=SC2086
$COMPOSE_CMD up -d $BUILD_FLAG

# ── Wait for PostgreSQL ────────────────────────────────────────────────────
info "Waiting for PostgreSQL to be healthy..."
RETRIES=30
WAIT=2
until $COMPOSE_CMD exec -T postgres pg_isready -U postgres -d trustline &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    fatal "PostgreSQL did not become healthy in time. Run: $COMPOSE_CMD logs postgres"
  fi
  sleep "$WAIT"
done
success "PostgreSQL is healthy."

# ── Wait for backend ───────────────────────────────────────────────────────
info "Waiting for backend API to start..."
RETRIES=20
until $COMPOSE_CMD exec -T backend wget -qO- http://localhost:4000/health &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    fatal "Backend did not start in time. Run: $COMPOSE_CMD logs backend"
  fi
  sleep 2
done
success "Backend API is healthy."

# ── Migrations ─────────────────────────────────────────────────────────────
info "Running database migrations..."
$COMPOSE_CMD exec -T backend npm run migrate:up
success "Migrations applied."

# ── Seed ──────────────────────────────────────────────────────────────────
info "Seeding demo data..."
$COMPOSE_CMD exec -T backend npm run seed
success "Demo data seeded."

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}  ✅  TrustLine is ready!${RESET}"
echo ""
echo -e "  ${BOLD}Frontend:${RESET}      ${CYAN}http://localhost:5173${RESET}"
echo -e "  ${BOLD}Backend API:${RESET}   ${CYAN}http://localhost:4000${RESET}"
echo -e "  ${BOLD}Health check:${RESET}  ${CYAN}http://localhost:4000/health${RESET}"
echo ""
echo -e "  ${BOLD}Demo pages:${RESET}"
echo -e "    Dispute resolution  →  ${CYAN}http://localhost:5173/demo/dispute${RESET}"
echo -e "    Attack simulation   →  ${CYAN}http://localhost:5173/demo/attack${RESET}"
echo -e "    Phishing clone      →  ${CYAN}http://localhost:5173/demo/phishing-clone${RESET}"
echo ""
echo -e "  To stop:  ${YELLOW}$COMPOSE_CMD down${RESET}"
echo -e "  Logs:     ${YELLOW}$COMPOSE_CMD logs -f backend${RESET}"
echo ""
