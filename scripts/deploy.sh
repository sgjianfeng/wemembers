#!/bin/bash
# ============================================================
# wemembers.store - 一键部署脚本
# 用法: ./scripts/deploy.sh
# ============================================================
set -euo pipefail

# ── 配置 ──────────────────────────────────────────────
SERVER_HOST="43.106.94.37"
SERVER_USER="root"
SERVER_APP_DIR="/var/www/wemembers"
SERVER_KEY="${SERVER_KEY:-$HOME/.ssh/wemember_key}"
SSH_OPTS="-i ${SERVER_KEY} -o StrictHostKeyChecking=no"

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   wemembers.store  一键部署              ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Target: ${SERVER_USER}@${SERVER_HOST}"
echo "  App:    ${SERVER_APP_DIR}"
echo ""

# ── 1. 预检 ──────────────────────────────────────────
log "预检中..."

# 查找 SSH Key
if [ ! -f "${SERVER_KEY}" ]; then
    for candidate in ~/.ssh/wemember_key ./wemember_key; do
        [ -f "$candidate" ] && SERVER_KEY="$candidate" && break
    done
fi
[ ! -f "${SERVER_KEY}" ] && err "找不到 SSH Key 'wemember_key'。请放到 ~/.ssh/wemember_key"
chmod 600 "${SERVER_KEY}" 2>/dev/null || true
SSH_OPTS="-i ${SERVER_KEY} -o StrictHostKeyChecking=no"
REMOTE_CMD="ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER_HOST}"
log "SSH Key: ${SERVER_KEY}"

# 测试连接
if ! ${REMOTE_CMD} "echo ok" > /dev/null 2>&1; then
    err "无法连接 ${SERVER_HOST}，请检查 SSH Key 和网络"
fi
log "SSH 连接正常"

# ── 2. 构建 ──────────────────────────────────────────
log "构建 Next.js (standalone 模式)..."

rm -rf .next
NODE_ENV=production npx next build

log "构建完成"

# ── 3. 准备部署包 ──────────────────────────────────────
log "准备部署包..."

DEPLOY_DIR=$(mktemp -d)
trap "rm -rf ${DEPLOY_DIR}" EXIT

# Standalone 模式: .next/standalone 包含独立运行所需的全部文件
# 注意: * 不匹配 .next (dot dir), 需要单独复制
cp -r .next/standalone/* "${DEPLOY_DIR}/" 2>/dev/null || true
cp -r .next/standalone/.next "${DEPLOY_DIR}/" 2>/dev/null || {
    # 如果 standalone 为空或不完整，回退到复制整个 .next
    warn "Standalone not found, copying full .next..."
    cp -r .next "${DEPLOY_DIR}/"
    cp -r node_modules "${DEPLOY_DIR}/"
}
cp -r .next/static "${DEPLOY_DIR}/.next/" 2>/dev/null || true
cp -r public "${DEPLOY_DIR}/" 2>/dev/null || true
cp -r prisma "${DEPLOY_DIR}/"

# 如果 standalone 包含 node_modules，则不需要额外复制
if [ ! -d "${DEPLOY_DIR}/node_modules" ]; then
    cp -r node_modules "${DEPLOY_DIR}/" 2>/dev/null || true
fi

log "部署包就绪"

# ── 4. 上传到服务器 ────────────────────────────────────
log "上传到服务器..."

RELEASE_NAME="release-$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="${SERVER_APP_DIR}/releases/${RELEASE_NAME}"

${REMOTE_CMD} "mkdir -p ${RELEASE_DIR} ${SERVER_APP_DIR}/data"

rsync -avz --delete \
    -e "ssh ${SSH_OPTS}" \
    "${DEPLOY_DIR}/" \
    "${SERVER_USER}@${SERVER_HOST}:${RELEASE_DIR}/"

log "已上传到 ${RELEASE_DIR}"

# ── 5. 服务器端设置 ────────────────────────────────────
log "服务器端配置中..."

${REMOTE_CMD} << REMOTE_SCRIPT
set -e
cd ${RELEASE_DIR}

# 链接 .env
ln -sfn ${SERVER_APP_DIR}/.env .env

# 链接数据库文件 (SQLite 持久化)
if [ ! -f "${SERVER_APP_DIR}/data/production.db" ]; then
    touch ${SERVER_APP_DIR}/data/production.db
fi
ln -sfn ${SERVER_APP_DIR}/data/production.db prisma/dev.db

# 生成 Prisma Client
npx prisma generate 2>/dev/null || echo "  prisma generate skipped"

# 数据库迁移
npx prisma db push --accept-data-loss 2>/dev/null || echo "  db push skipped - DB may be up to date"

# 种子数据 (仅首次)
if [ ! -f "${SERVER_APP_DIR}/data/.seeded" ]; then
    echo "首次部署，运行种子数据..."
    npx prisma db seed 2>/dev/null && touch ${SERVER_APP_DIR}/data/.seeded || echo "  seed skipped"
fi
REMOTE_SCRIPT

log "服务器配置完成"

# ── 6. 切换发布 ──────────────────────────────────────────
log "切换发布..."

${REMOTE_CMD} << REMOTE_SCRIPT
set -e

# 更新 current 软链接
ln -sfn ${RELEASE_DIR} ${SERVER_APP_DIR}/current

cd ${SERVER_APP_DIR}/current

# 安装 PM2 (如果未安装)
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# 停止旧进程
pm2 delete wemembers 2>/dev/null || true

# 启动新进程
HOSTNAME=0.0.0.0 PORT=3000 pm2 start server.js --name wemembers --interpreter node
pm2 save

echo "切换到 ${RELEASE_NAME}"
REMOTE_SCRIPT

log "发布切换完成"

# ── 7. 清理 ──────────────────────────────────────────
${REMOTE_CMD} "cd ${SERVER_APP_DIR}/releases && ls -t | tail -n +6 | xargs rm -rf 2>/dev/null || true"
log "旧发布已清理 (保留最近 5 个)"

# ── 8. 验证 ──────────────────────────────────────────
log "验证部署..."
sleep 3

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://${SERVER_HOST}:3000 2>/dev/null || echo "000")
case "${HTTP_CODE}" in
    200|301|302|307|308) log "应用响应正常 (HTTP ${HTTP_CODE})" ;;
    *) warn "应用可能未就绪 (HTTP ${HTTP_CODE})。请检查: pm2 logs wemembers" ;;
esac

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       部署完成! ✅                        ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  App:    http://${SERVER_HOST}:3000       ║"
echo "  ║  Site:   https://wemembers.store         ║"
echo "  ║  SSH:    ssh -i \${SERVER_KEY} root@${SERVER_HOST}"
echo "  ║  Logs:   ssh ... 'pm2 logs wemembers'    ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
