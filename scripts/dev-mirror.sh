#!/usr/bin/env bash
# ============================================================
# 用本地生产镜像库启动 Next.js dev（PostgreSQL）
#
# 前置:
#   bash scripts/pull-prod-db.sh restore   # 若镜像容器未就绪
#
# 用法:
#   npm run dev:mirror
#   bash scripts/dev-mirror.sh
#   bash scripts/dev-mirror.sh --port 3001
#
# 退出时自动还原 prisma schema 为 sqlite 并 regenerate。
# 只连本机 Docker 镜像库，不碰真生产。
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

LOCAL_PORT="${LOCAL_PORT:-5433}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-wemembers-prod-mirror}"
LOCAL_DB_USER="wemembers"
LOCAL_DB_PASS="localmirror"
LOCAL_DB_NAME="wemembers"
SCHEMA_FILE="${ROOT}/prisma/schema.prisma"
MIRROR_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASS}@127.0.0.1:${LOCAL_PORT}/${LOCAL_DB_NAME}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; exit 1; }

# ── 前置检查 ──────────────────────────────────────────
command -v docker >/dev/null 2>&1 || err "需要 docker"
command -v npx >/dev/null 2>&1 || err "需要 npx / Node"

if ! docker ps --format '{{.Names}}' | grep -qx "${LOCAL_CONTAINER}"; then
  err "镜像容器 ${LOCAL_CONTAINER} 未运行。先执行:
  bash scripts/pull-prod-db.sh restore"
fi

# 探活
if ! docker exec "${LOCAL_CONTAINER}" pg_isready -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" >/dev/null 2>&1; then
  err "容器在跑但 Postgres 未就绪，稍后再试或 re-run restore"
fi

users="$(docker exec "${LOCAL_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -A -c 'SELECT count(*) FROM "User";' 2>/dev/null || echo "?")"
meow="$(docker exec "${LOCAL_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -A -c "SELECT email FROM \"User\" WHERE email='meow.jianfeng@gmail.com';" 2>/dev/null | tr -d '[:space:]' || true)"

log "镜像库就绪 · User count=${users}"
if [ -n "${meow}" ]; then
  log "Meow BBQ 账号存在: ${meow}"
else
  warn "未找到 meow.jianfeng@gmail.com（镜像可能过旧，可 re-dump + restore）"
fi

# ── schema 切换 + 退出还原 ────────────────────────────
SCHEMA_BACKUP=""
SWITCHED=0

restore_schema() {
  local rc=$?
  if [ "${SWITCHED}" = "1" ] && [ -n "${SCHEMA_BACKUP}" ] && [ -f "${SCHEMA_BACKUP}" ]; then
    cp "${SCHEMA_BACKUP}" "${SCHEMA_FILE}"
    rm -f "${SCHEMA_BACKUP}"
    SCHEMA_BACKUP=""
    SWITCHED=0
    log "已还原 prisma schema → sqlite"
    # 还原后 client 也要回到 sqlite，避免下次 npm run dev 挂掉
    if ! npx prisma generate >/dev/null 2>&1; then
      warn "prisma generate (sqlite) 失败，请手动: npx prisma generate"
    else
      log "Prisma client 已 regenerate (sqlite)"
    fi
  fi
  exit "${rc}"
}
trap restore_schema EXIT INT TERM

if ! grep -q 'provider = "sqlite"' "${SCHEMA_FILE}"; then
  if grep -q 'provider = "postgresql"' "${SCHEMA_FILE}"; then
    warn "schema 已是 postgresql，跳过切换（退出时不会强制改回 sqlite）"
  else
    err "无法识别 ${SCHEMA_FILE} 的 datasource provider"
  fi
else
  SCHEMA_BACKUP=$(mktemp)
  cp "${SCHEMA_FILE}" "${SCHEMA_BACKUP}"
  # macOS / GNU sed 兼容
  if sed --version >/dev/null 2>&1; then
    sed -i 's/provider = "sqlite"/provider = "postgresql"/' "${SCHEMA_FILE}"
  else
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "${SCHEMA_FILE}"
    rm -f "${SCHEMA_FILE}.bak"
  fi
  SWITCHED=1
  log "Prisma provider → postgresql"
fi

export DATABASE_URL="${MIRROR_URL}"
# 避免 .env 里的 file:./dev.db 覆盖意图（Next 仍会读 .env，但 process env 优先）
log "DATABASE_URL → 本地镜像 :${LOCAL_PORT}/${LOCAL_DB_NAME}"

# 生产 DB 里的 /uploads/... 文件默认不在本机；回源到生产静态域名
# 本地若已有 public/uploads 文件，浏览器仍可优先走同域；无文件时由 BrandAvatar 拼绝对 URL
export NEXT_PUBLIC_MIRROR_ASSET_ORIGIN="${NEXT_PUBLIC_MIRROR_ASSET_ORIGIN:-https://wemembers.store}"
export MIRROR_ASSET_ORIGIN="${MIRROR_ASSET_ORIGIN:-$NEXT_PUBLIC_MIRROR_ASSET_ORIGIN}"
log "上传资源回源 → ${NEXT_PUBLIC_MIRROR_ASSET_ORIGIN}"

log "prisma generate..."
npx prisma generate

cat <<EOF

  ╔════════════════════════════════════════════════════╗
  ║  dev:mirror — 生产数据镜像                         ║
  ╠════════════════════════════════════════════════════╣
  ║  DB:     ${MIRROR_URL}
  ║  App:    http://localhost:3000
  ║  Login:  企业 · meow.jianfeng@gmail.com
  ║  密码:   生产密码 / 注册默认 MeowPilot2026!
  ║  验证码: 看本终端日志（本地一般不真发邮件）
  ║
  ║  Ctrl+C 退出后自动还原 schema → sqlite
  ╚════════════════════════════════════════════════════╝

EOF

# 不用 exec：保留 shell 以便 EXIT trap 能还原 schema
# 透传额外参数，例如 --port 3001
npx next dev "$@"
# next 退出后 trap 会 restore_schema
