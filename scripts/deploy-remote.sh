#!/bin/bash
# ============================================================
# wemembers.store - 服务器端构建部署（SSH）
#
# 流程：
#   1. 本机可选 git push
#   2. rsync 源码到服务器 /var/www/wemembers/repo
#   3. SSH 在服务器 x86 上 npm ci + next build + 切 release / PM2
#
# 用法:
#   ./scripts/deploy-remote.sh
#   SKIP_PUSH=1 ./scripts/deploy-remote.sh
#
# 说明:
#   - 服务器当前无 GitHub 密钥，故用 rsync 推源码（比本机 Docker 交叉编译快）
#   - 本机构建路径仍用 ./scripts/deploy.sh
# ============================================================
set -euo pipefail

SERVER_HOST="43.106.94.37"
SERVER_USER="root"
SERVER_APP_DIR="/var/www/wemembers"
SERVER_REPO_DIR="${SERVER_APP_DIR}/repo"
SERVER_KEY="${SERVER_KEY:-$HOME/.ssh/wemember_key}"
SKIP_PUSH="${SKIP_PUSH:-0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  wemembers.store  远程构建部署 (SSH)     ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Target: ${SERVER_USER}@${SERVER_HOST}"
echo "  Repo:   ${SERVER_REPO_DIR}"
echo "  App:    ${SERVER_APP_DIR}"
echo ""

# ── 1. 预检 ──────────────────────────────────────────
log "预检中..."

if [ ! -f "${SERVER_KEY}" ]; then
  for candidate in ~/.ssh/wemember_key ./wemember_key; do
    [ -f "$candidate" ] && SERVER_KEY="$candidate" && break
  done
fi
[ ! -f "${SERVER_KEY}" ] && err "找不到 SSH Key 'wemember_key'。请放到 ~/.ssh/wemember_key"
chmod 600 "${SERVER_KEY}" 2>/dev/null || true
SSH_OPTS="-i ${SERVER_KEY} -o StrictHostKeyChecking=no"
REMOTE="ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER_HOST}"

if ! ${REMOTE} "echo ok" >/dev/null 2>&1; then
  err "无法连接 ${SERVER_HOST}，请检查 SSH Key 和网络"
fi
log "SSH 连接正常 (${SERVER_KEY})"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

# ── 2. 可选 push ───────────────────────────────────────
if [ "${SKIP_PUSH}" != "1" ]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  if git remote get-url origin >/dev/null 2>&1; then
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      warn "工作区有未提交改动，将 rsync 当前文件（建议先 commit）"
    fi
    log "推送 ${BRANCH} → origin..."
    if git push origin "${BRANCH}"; then
      log "git push 完成"
    else
      warn "git push 失败（仍会 rsync 本地文件）"
    fi
  else
    warn "无 origin remote，跳过 push"
  fi
else
  log "SKIP_PUSH=1，跳过 git push"
fi

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "本地 HEAD: ${COMMIT}"

# ── 3. rsync 源码 ──────────────────────────────────────
log "同步源码到 ${SERVER_REPO_DIR} ..."
${REMOTE} "mkdir -p ${SERVER_REPO_DIR} ${SERVER_APP_DIR}/releases ${SERVER_APP_DIR}/data"

rsync -az --delete \
  -e "ssh ${SSH_OPTS}" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='prisma/dev.db' \
  --exclude='prisma/dev.db-journal' \
  --exclude='prisma/*.db' \
  --exclude='test-results' \
  --exclude='playwright-report' \
  --exclude='tests/screenshots' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.DS_Store' \
  --exclude='.claude' \
  --exclude='.grok' \
  ./ \
  "${SERVER_USER}@${SERVER_HOST}:${SERVER_REPO_DIR}/"

log "源码同步完成"

# ── 4. 服务器构建 ──────────────────────────────────────
RELEASE_NAME="release-$(date +%Y%m%d-%H%M%S)"
log "服务器构建（x86 原生）→ ${RELEASE_NAME} ..."

${REMOTE} \
  "export SERVER_APP_DIR='${SERVER_APP_DIR}' SERVER_REPO_DIR='${SERVER_REPO_DIR}' RELEASE_NAME='${RELEASE_NAME}'; \
   bash '${SERVER_REPO_DIR}/scripts/remote-build-on-server.sh'"

log "服务器构建与切换完成"

# ── 5. 验证 ──────────────────────────────────────────
log "验证部署..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "http://${SERVER_HOST}:3000" 2>/dev/null || echo "000")
case "${HTTP_CODE}" in
  200|301|302|307|308) log "应用响应正常 (HTTP ${HTTP_CODE})" ;;
  *) warn "应用可能未就绪 (HTTP ${HTTP_CODE})。检查: ssh ... 'pm2 logs wemembers'" ;;
esac

SITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://wemembers.store" 2>/dev/null || echo "000")
case "${SITE_CODE}" in
  200|301|302|307|308) log "站点 https://wemembers.store → HTTP ${SITE_CODE}" ;;
  *) warn "站点探测 HTTP ${SITE_CODE}" ;;
esac

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       远程部署完成 ✅                     ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Release: ${RELEASE_NAME}"
echo "  ║  Commit:  ${COMMIT}"
echo "  ║  Site:    https://wemembers.store"
echo "  ║  Logs:    ssh -i \${SERVER_KEY} root@${SERVER_HOST} 'pm2 logs wemembers'"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  日常发布推荐："
echo "    ./scripts/deploy-remote.sh   # rsync 源码 + 服务器 build（本机不交叉编译）"
echo "    ./scripts/deploy.sh          # 本机构建 + rsync 产物"
echo "    SKIP_PUSH=1 ./scripts/deploy-remote.sh"
echo ""
