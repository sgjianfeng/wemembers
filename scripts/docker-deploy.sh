#!/bin/bash
# ============================================================
# wemembers.store - 本地 Build + 上传部署脚本
# ============================================================
set -euo pipefail

SERVER_HOST="43.106.94.37"
SERVER_USER="root"
SERVER_KEY="${SERVER_KEY:-$HOME/.ssh/wemember_key}"
SSH_OPTS="-i ${SERVER_KEY} -o StrictHostKeyChecking=no"
REMOTE="ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER_HOST}"
IMAGE_NAME="wemembers-prod-wemembers:latest"
TAR_FILE="/tmp/wemembers-image.tar.gz"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  wemembers.store - Deploy (local build)  ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 1. Pre-flight ──
log "Pre-flight..."
[ ! -f "${SERVER_KEY}" ] && err "SSH Key not found: ${SERVER_KEY}"
chmod 600 "${SERVER_KEY}" 2>/dev/null || true
if ! ${REMOTE} "echo ok" > /dev/null 2>&1; then
    err "SSH connection failed"
fi
log "SSH connection OK"

# ── 2. Build image (linux/amd64) ──
log "Building Docker image (linux/amd64)..."
docker buildx build --platform linux/amd64 \
    -t ${IMAGE_NAME} \
    -f Dockerfile . 2>&1 | tail -5
log "Image build complete"

# ── 3. Export + compress ──
log "Exporting image..."
docker save ${IMAGE_NAME} | gzip > ${TAR_FILE}
SIZE=$(ls -lh ${TAR_FILE} | awk '{print $5}')
log "Image exported: ${TAR_FILE} (${SIZE})"

# ── 4. Sync code to server ──
log "Syncing code to server..."
rsync -az \
    -e "ssh ${SSH_OPTS}" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='prisma/dev.db' \
    --exclude='prisma/dev.db-journal' \
    --exclude='test-results' \
    --exclude='tests' \
    --exclude='playwright-report' \
    --exclude='.claude' \
    ./ \
    "${SERVER_USER}@${SERVER_HOST}:/root/wemembers/"
log "Code sync complete"

# ── 5. Upload image ──
log "Uploading image to server..."
rsync -az --progress \
    -e "ssh ${SSH_OPTS}" \
    ${TAR_FILE} \
    "${SERVER_USER}@${SERVER_HOST}:/tmp/wemembers-image.tar.gz" 2>&1 | tail -3
log "Image upload complete"

# ── 6. Server-side: load image + start containers ──
log "Server-side deployment..."

${REMOTE} << 'REMOTE_SCRIPT'
set -e
cd /root/wemembers

# Load new image
echo "Loading Docker image..."
gunzip -c /tmp/wemembers-image.tar.gz | docker load

# Create .env.production if not exists
if [ ! -f .env.production ]; then
    cp .env.production .env.production.bak 2>/dev/null || true
    echo "WARNING: Using default .env.production -- please edit with real values!"
fi

# Stop old, start new
echo "Restarting containers..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for PostgreSQL..."
sleep 15

# Run Prisma DB migration
echo "Running DB migration..."
docker compose -f docker-compose.prod.yml exec -T wemembers \
    sh -c "cd /app && node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss" 2>&1 || \
    echo "   Migration may have failed -- check logs"

# Seed with production demo data if DB is empty
HAS_USERS=$(docker compose -f docker-compose.prod.yml exec -T wemembers_db \
    psql -U wemembers -d wemembers_prod -t -c "SELECT count(*) FROM \"User\";" 2>/dev/null || echo "0")
if [ "${HAS_USERS}" = "0" ] || [ "${HAS_USERS}" = "  0" ]; then
    echo "Running production seed..."
    docker compose -f docker-compose.prod.yml exec -T wemembers \
        sh -c "cd /app && node ./node_modules/tsx/dist/cli.mjs prisma/seed-prod.ts" 2>&1 || \
        echo "   Seed skipped -- run 'bash scripts/db-migrate.sh --seed' manually"
fi

echo ""
echo "=== Container Status ==="
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== Recent Logs ==="
docker compose -f docker-compose.prod.yml logs --tail=15
REMOTE_SCRIPT

# ── 7. Cleanup ──
rm -f ${TAR_FILE}
log "Cleaned up local temp files"

# ── 8. Verify ──
log "Verifying deployment..."
sleep 3
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}/api/health" 2>/dev/null || echo "000")
case "${HEALTH}" in
    200) log "Health check OK (HTTP ${HEALTH})" ;;
    *) warn "Health check returned ${HEALTH} -- check logs" ;;
esac

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Deployment Complete!               ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Site:  https://wemembers.store         ║"
echo "  ║  Health: /api/health                    ║"
echo "  ║  SSH:   ssh -i wemember_key root@${SERVER_HOST}"
echo "  ║  Logs:  docker compose logs -f           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
