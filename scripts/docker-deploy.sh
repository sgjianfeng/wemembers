#!/bin/bash
# ============================================================
# wemembers.store - 本地 Build + 上传部署脚本
# 参考 wemember 的部署模式
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

# ── 1. 预检 ──────────────────────────────────────────
log "预检..."
[ ! -f "${SERVER_KEY}" ] && err "SSH Key 未找到: ${SERVER_KEY}"
chmod 600 "${SERVER_KEY}" 2>/dev/null || true
if ! ${REMOTE} "echo ok" > /dev/null 2>&1; then
    err "SSH 连接失败"
fi
log "SSH 连接正常"

# ── 2. 本地 Build 镜像 (linux/amd64) ────────────────────
log "本地构建 Docker 镜像 (linux/amd64)..."
docker buildx build --platform linux/amd64 \
    -t ${IMAGE_NAME} \
    -f Dockerfile . 2>&1 | tail -5
log "镜像构建完成"

# ── 3. 导出并压缩镜像 ───────────────────────────────────
log "导出镜像..."
docker save ${IMAGE_NAME} | gzip > ${TAR_FILE}
SIZE=$(ls -lh ${TAR_FILE} | awk '{print $5}')
log "镜像已导出: ${TAR_FILE} (${SIZE})"

# ── 4. 同步代码到服务器 ──────────────────────────────────
log "同步代码到服务器..."
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
log "代码同步完成"

# ── 5. 上传镜像 ─────────────────────────────────────────
log "上传镜像到服务器..."
rsync -az --progress \
    -e "ssh ${SSH_OPTS}" \
    ${TAR_FILE} \
    "${SERVER_USER}@${SERVER_HOST}:/tmp/wemembers-image.tar.gz" 2>&1 | tail -3
log "镜像上传完成"

# ── 6. 服务器端：加载镜像 + 启动容器 ────────────────────────
log "服务器端部署..."

${REMOTE} << 'REMOTE_SCRIPT'
set -e
cd /root/wemembers

# Load new image
echo "📦 Loading Docker image..."
gunzip -c /tmp/wemembers-image.tar.gz | docker load

# Create .env.production if not exists
if [ ! -f .env.production ]; then
    cp .env.production .env.production.bak 2>/dev/null || true
    echo "⚠️  Using default .env.production — please edit with real values!"
fi

# Stop old, start new
echo "🔄 Restarting containers..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
docker compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for PostgreSQL..."
sleep 15

# Run Prisma DB migration
echo "🔧 Running DB migration..."
docker compose -f docker-compose.prod.yml exec -T wemembers \
    sh -c "cd /app && npx prisma@5.22.0 db push --skip-generate --accept-data-loss" 2>&1 || echo "   Migration may have failed — check logs"

# Seed if needed
HAS_USERS=$(docker compose -f docker-compose.prod.yml exec -T wemembers_db \
    psql -U wemembers -d wemembers_prod -t -c "SELECT count(*) FROM \"User\";" 2>/dev/null || echo "0")
if [ "${HAS_USERS}" = "0" ] || [ "${HAS_USERS}" = "  0" ]; then
    echo "🌱 Seeding database..."
    docker compose -f docker-compose.prod.yml exec -T wemembers \
        sh -c "cd /app && npx prisma@5.22.0 db seed" 2>&1 || echo "   Seed skipped"
fi

echo ""
echo "=== Container Status ==="
docker compose -f docker-compose.prod.yml ps

echo ""
echo "=== Recent Logs ==="
docker compose -f docker-compose.prod.yml logs --tail=15
REMOTE_SCRIPT

# ── 7. 清理本地临时文件 ───────────────────────────────────
rm -f ${TAR_FILE}
log "清理本地临时文件"

# ── 8. 验证 ──────────────────────────────────────────
log "验证部署..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: wemembers.store" http://${SERVER_HOST}/ 2>/dev/null || echo "000")
case "${HTTP_CODE}" in
    200|301|302|307|308) log "应用响应正常 (HTTP ${HTTP_CODE})" ;;
    *) warn "应用可能未就绪 (HTTP ${HTTP_CODE})" ;;
esac

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Deployment Complete! ✅             ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Site:  http://wemembers.store           ║"
echo "  ║  Server: ssh -i wemember_key root@${SERVER_HOST}"
echo "  ║  Logs:   docker compose logs -f           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
