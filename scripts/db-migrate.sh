#!/bin/bash
# ============================================================
# wemembers.store — Production DB setup (run on server)
#
# Usage:
#   bash scripts/db-migrate.sh          # push schema + seed if empty
#   bash scripts/db-migrate.sh --seed   # force re-seed
#   bash scripts/db-migrate.sh --reset  # DANGER: wipe and re-create
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

MODE="${1:-push}"

# ── Detect environment ──
if [ -f /.dockerenv ]; then
  # Inside Docker container
  PRISMA_CMD="npx prisma@5"
  RUN_IN_CONTAINER=""
else
  # On Docker host — exec into the wemembers container
  cd /root/wemembers 2>/dev/null || cd "$(dirname "$0")/.."
  if docker compose -f docker-compose.prod.yml ps wemembers 2>/dev/null | grep -q "Up"; then
    PRISMA_CMD="docker compose -f docker-compose.prod.yml exec -T wemembers npx prisma@5"
    RUN_IN_CONTAINER="docker compose -f docker-compose.prod.yml exec -T wemembers"
  else
    warn "Docker containers not running, trying local prisma..."
    PRISMA_CMD="npx prisma@5"
    RUN_IN_CONTAINER=""
  fi
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  wemembers.store — DB Setup             ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

case "${MODE}" in
  --reset)
    echo "⚠️  WARNING: This will DELETE ALL DATA!"
    echo "   Type 'yes' to confirm:"
    read -r CONFIRM
    if [ "${CONFIRM}" != "yes" ]; then
      echo "Aborted."
      exit 0
    fi
    log "Resetting database..."
    ${PRISMA_CMD} db push --force-reset --skip-generate --accept-data-loss
    log "Running production seed..."
    ${RUN_IN_CONTAINER} sh -c "cd /app && npx tsx prisma/seed-prod.ts"
    log "Reset + seed complete!"
    ;;

  --seed)
    log "Running production seed..."
    ${RUN_IN_CONTAINER} sh -c "cd /app && npx tsx prisma/seed-prod.ts"
    log "Seed complete!"
    ;;

  push|*)
    log "Pushing Prisma schema to database..."
    ${PRISMA_CMD} db push --skip-generate --accept-data-loss
    log "Schema push complete!"

    # Check if DB is empty and seed if so
    HAS_USERS=$(${RUN_IN_CONTAINER} sh -c "cd /app && node -e \"
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.user.count().then(c => { console.log(c); process.exit(0); }).catch(() => { console.log(0); process.exit(0); });
    \"" 2>/dev/null || echo "0")

    if [ "${HAS_USERS}" = "0" ] || [ -z "${HAS_USERS}" ]; then
      log "Database is empty, running production seed..."
      ${RUN_IN_CONTAINER} sh -c "cd /app && npx tsx prisma/seed-prod.ts" || warn "Seed failed — you can run 'bash scripts/db-migrate.sh --seed' later"
    else
      log "Database has ${HAS_USERS} users — skipping seed."
      echo "   To force re-seed: bash scripts/db-migrate.sh --seed"
    fi
    ;;
esac

echo ""
echo "  ✅ DB setup complete!"
echo ""
