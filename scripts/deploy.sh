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

# 生产连 PostgreSQL：本地 schema 默认 sqlite，构建前切换并生成客户端，结束后还原
SCHEMA_FILE="prisma/schema.prisma"
SCHEMA_BACKUP=""
if grep -q 'provider = "sqlite"' "${SCHEMA_FILE}"; then
    SCHEMA_BACKUP=$(mktemp)
    cp "${SCHEMA_FILE}" "${SCHEMA_BACKUP}"
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "${SCHEMA_FILE}"
    rm -f "${SCHEMA_FILE}.bak"
    log "Prisma provider → postgresql（生产构建）"
    npx prisma generate
fi

rm -rf .next
# 保证失败时还原 schema + 本地 sqlite client
restore_schema() {
    if [ -n "${SCHEMA_BACKUP}" ] && [ -f "${SCHEMA_BACKUP}" ]; then
        cp "${SCHEMA_BACKUP}" "${SCHEMA_FILE}"
        rm -f "${SCHEMA_BACKUP}"
        SCHEMA_BACKUP=""
        log "已还原 prisma schema 为 sqlite（本地开发）"
        npx prisma generate >/dev/null
    fi
}
trap restore_schema EXIT

NODE_ENV=production npx next build

log "构建完成"

# ── 3. 准备部署包 ──────────────────────────────────────
log "准备部署包..."

DEPLOY_DIR=$(mktemp -d)
# 打包完成后再还原本地 schema（包内已含 postgresql client）
cleanup_deploy() {
    rm -rf "${DEPLOY_DIR}"
    restore_schema
}
trap cleanup_deploy EXIT

# 确保 standalone 带上完整 Prisma 引擎（linux）
if [ -d "node_modules/.prisma" ]; then
    mkdir -p .next/standalone/node_modules
    cp -R node_modules/.prisma .next/standalone/node_modules/ 2>/dev/null || true
    cp -R node_modules/@prisma .next/standalone/node_modules/ 2>/dev/null || true
fi

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

# Prisma Client 已在本地以 postgresql 生成并打进 standalone 包
# 标记已 seed 避免重复
if [ ! -f "${SERVER_APP_DIR}/data/.seeded" ]; then
  touch ${SERVER_APP_DIR}/data/.seeded
fi

# 快速自检：Prisma 能否用生产 DATABASE_URL 查询
node <<'NODE' || { echo "  ERROR: Prisma DB self-check failed"; exit 1; }
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.user.count().then((n) => {
  console.log("  prisma ok, users=", n);
  return p.\$disconnect();
}).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
NODE
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

# 从 /var/www/wemembers/.env 注入环境变量（否则 PM2 会保留旧的空/短密钥）
# 生成 ecosystem，保证 STRIPE_* / DATABASE_URL 等与 .env 一致
node <<'NODE'
const fs = require("fs");
const envPath = "/var/www/wemembers/.env";
const env = { HOSTNAME: "0.0.0.0", PORT: "3000", NODE_ENV: "production" };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i);
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    env[k] = v;
  }
}
const cwd = process.cwd();
const cfg = {
  apps: [{
    name: "wemembers",
    script: cwd + "/server.js",
    cwd,
    interpreter: "node",
    env,
  }],
};
fs.writeFileSync("/tmp/wemembers-ecosystem.config.cjs",
  "module.exports = " + JSON.stringify(cfg, null, 2) + ";\n");
console.log("ecosystem written; STRIPE_WEBHOOK_SECRET len=", (env.STRIPE_WEBHOOK_SECRET || "").length);
NODE

pm2 start /tmp/wemembers-ecosystem.config.cjs
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
