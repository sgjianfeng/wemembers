#!/usr/bin/env bash
# ============================================================
# 从生产拉取 PostgreSQL 数据到本地，用于核对数据与同步状态
#
# 生产拓扑:
#   - App:   /var/www/wemembers (PM2)
#   - DB:    PostgreSQL wemembers @ 127.0.0.1:5432 (platform-postgres)
#   - URL:   /var/www/wemembers/.env → DATABASE_URL
#
# 用法:
#   bash scripts/pull-prod-db.sh summary           # 远程表计数 + 业务摘要（默认）
#   bash scripts/pull-prod-db.sh dump              # pg_dump → tmp/prod-dumps/
#   bash scripts/pull-prod-db.sh full              # dump + summary
#   bash scripts/pull-prod-db.sh restore [file]    # 恢复到本地 Docker Postgres :5433
#   bash scripts/pull-prod-db.sh verify [remote|local]
#   bash scripts/pull-prod-db.sh psql              # 进入本地镜像库 psql
#
# 环境变量:
#   SERVER_KEY   SSH key（默认 ~/.ssh/wemember_key）
#   DUMP_DIR     本地 dump 目录（默认 tmp/prod-dumps）
#   LOCAL_PORT   本地 Postgres 端口（默认 5433）
#
# 注意:
#   - 本地开发默认是 SQLite；本脚本不会改写 prisma/dev.db
#   - dump 含 PII（手机/邮箱），禁止提交 git
#   - 只读生产；restore 仅写入本机 Docker 容器
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

SERVER_HOST="${SERVER_HOST:-43.106.94.37}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_KEY="${SERVER_KEY:-$HOME/.ssh/wemember_key}"
DUMP_DIR="${DUMP_DIR:-${ROOT}/tmp/prod-dumps}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-wemembers-prod-mirror}"
LOCAL_DB_USER="wemembers"
LOCAL_DB_PASS="localmirror"
LOCAL_DB_NAME="wemembers"
REMOTE_HELPER="/tmp/wemembers-prod-db-remote.mjs"
REMOTE_TMP="/tmp/wemembers-prod-pull"
LOCAL_HELPER="${ROOT}/scripts/lib/prod-db-remote.mjs"

MODE="${1:-summary}"
ARG2="${2:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

resolve_key() {
  if [ ! -f "${SERVER_KEY}" ]; then
    for candidate in ~/.ssh/wemember_key ./wemember_key; do
      [ -f "$candidate" ] && SERVER_KEY="$candidate" && break
    done
  fi
  [ -f "${SERVER_KEY}" ] || err "找不到 SSH Key。请放到 ~/.ssh/wemember_key 或设 SERVER_KEY"
  chmod 600 "${SERVER_KEY}" 2>/dev/null || true
  SSH_OPTS=(-i "${SERVER_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=15)
  REMOTE=(ssh "${SSH_OPTS[@]}" "${SERVER_USER}@${SERVER_HOST}")
}

ssh_ok() {
  "${REMOTE[@]}" "echo ok" >/dev/null 2>&1 || err "无法连接 ${SERVER_USER}@${SERVER_HOST}"
}

sync_remote_helper() {
  [ -f "${LOCAL_HELPER}" ] || err "缺少 ${LOCAL_HELPER}"
  scp -q "${SSH_OPTS[@]}" "${LOCAL_HELPER}" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_HELPER}"
}

remote_run() {
  # args passed to remote helper
  "${REMOTE[@]}" node "${REMOTE_HELPER}" "$@"
}

print_summary_pretty() {
  local file="$1"
  node -e '
const s = require(process.argv[1]);
console.log("");
console.log("  DB size:     ", s.size);
console.log("  Users:       ", s.business.users, JSON.stringify(s.roles));
console.log("  Stores:      ", s.business.stores);
console.log("  Campaigns:   ", s.business.campaigns, JSON.stringify(s.campaigns));
console.log("  Vouchers:    ", s.business.vouchers, "(active " + s.business.voucherActive + ")");
console.log("  Memberships: ", s.business.memberships);
console.log("  Redemptions: ", s.business.redemptions);
console.log("  Token sum:   ", s.business.tokenBalanceSum);
console.log("  Tickets:     ", s.business.physicalTickets);
console.log("  Settlements: ", s.business.settlements);
console.log("");
const nonzero = Object.entries(s.tables || {}).filter(([, n]) => n > 0);
console.log("  Non-empty tables (" + nonzero.length + "):");
for (const [k, n] of nonzero.sort((a, b) => b[1] - a[1])) {
  console.log("    " + String(k).padEnd(28) + n);
}
console.log("");
' "${file}"
}

# ── summary ──────────────────────────────────────────────
cmd_summary() {
  log "拉取生产库摘要（只读）..."
  mkdir -p "${DUMP_DIR}"
  sync_remote_helper

  local out="${DUMP_DIR}/summary-latest.json"
  remote_run summary > "${out}"

  local stamped="${DUMP_DIR}/summary-$(date +%Y%m%d-%H%M%S).json"
  cp "${out}" "${stamped}"

  log "摘要已写入: ${out}"
  print_summary_pretty "${out}"
}

# ── dump ─────────────────────────────────────────────────
cmd_dump() {
  log "SSH 连接正常 (${SERVER_KEY})"
  mkdir -p "${DUMP_DIR}"
  sync_remote_helper

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"

  log "在生产执行 pg_dump（custom + sql.gz）..."
  local meta
  meta="$(remote_run dump --stamp "${stamp}" --outdir "${REMOTE_TMP}")"
  echo "  ${meta}"

  local remote_custom remote_sql
  remote_custom="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.custom)' "${meta}")"
  remote_sql="$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.sqlGz)' "${meta}")"

  local local_custom="${DUMP_DIR}/wemembers-${stamp}.dump"
  local local_sql="${DUMP_DIR}/wemembers-${stamp}.sql.gz"
  local local_latest_custom="${DUMP_DIR}/wemembers-latest.dump"
  local local_latest_sql="${DUMP_DIR}/wemembers-latest.sql.gz"

  log "下载 dump → ${DUMP_DIR} ..."
  scp "${SSH_OPTS[@]}" \
    "${SERVER_USER}@${SERVER_HOST}:${remote_custom}" \
    "${local_custom}"
  scp "${SSH_OPTS[@]}" \
    "${SERVER_USER}@${SERVER_HOST}:${remote_sql}" \
    "${local_sql}"

  # portable relative symlinks inside DUMP_DIR
  (
    cd "${DUMP_DIR}"
    ln -sfn "wemembers-${stamp}.dump" "wemembers-latest.dump"
    ln -sfn "wemembers-${stamp}.sql.gz" "wemembers-latest.sql.gz"
  )

  # cleanup remote temp (keep last 3 of each)
  "${REMOTE[@]}" "rm -f '${remote_custom}' '${remote_sql}' 2>/dev/null || true; \
    ls -t ${REMOTE_TMP}/wemembers-*.dump 2>/dev/null | tail -n +4 | xargs -r rm -f 2>/dev/null || true; \
    ls -t ${REMOTE_TMP}/wemembers-*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm -f 2>/dev/null || true" || true

  log "Custom dump: ${local_custom} ($(du -h "${local_custom}" | awk '{print $1}'))"
  log "SQL gzip:    ${local_sql} ($(du -h "${local_sql}" | awk '{print $1}'))"
  log "Latest link: ${local_latest_custom}"
  warn "Dump 含生产 PII，勿提交 git（tmp/ 已 ignore）"

  log "附带刷新 summary..."
  local out="${DUMP_DIR}/summary-latest.json"
  remote_run summary > "${out}"
  cp "${out}" "${DUMP_DIR}/summary-${stamp}.json"
  print_summary_pretty "${out}"
}

# ── restore (local docker) ───────────────────────────────
cmd_restore() {
  local file="${ARG2:-${DUMP_DIR}/wemembers-latest.dump}"
  if [ -L "${file}" ]; then
    file="${DUMP_DIR}/$(readlink "${file}")"
  fi
  [ -f "${file}" ] || err "找不到 dump: ${file}。先运行: bash scripts/pull-prod-db.sh dump"
  command -v docker >/dev/null 2>&1 || err "需要本机 Docker 才能 restore"

  log "准备本地镜像库 ${LOCAL_CONTAINER} (port ${LOCAL_PORT})..."

  if docker ps -a --format '{{.Names}}' | grep -qx "${LOCAL_CONTAINER}"; then
    warn "容器已存在，将删除并重建（仅本地 mirror，不影响生产）"
    docker rm -f "${LOCAL_CONTAINER}" >/dev/null
  fi

  docker run -d \
    --name "${LOCAL_CONTAINER}" \
    -e POSTGRES_USER="${LOCAL_DB_USER}" \
    -e POSTGRES_PASSWORD="${LOCAL_DB_PASS}" \
    -e POSTGRES_DB="${LOCAL_DB_NAME}" \
    -p "${LOCAL_PORT}:5432" \
    pgvector/pgvector:pg15 >/dev/null

  log "等待 Postgres 就绪..."
  for i in $(seq 1 40); do
    if docker exec "${LOCAL_CONTAINER}" pg_isready -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
    if [ "$i" -eq 40 ]; then
      err "本地 Postgres 启动超时"
    fi
  done

  log "恢复 dump → ${LOCAL_CONTAINER}..."
  set +e
  docker exec -i "${LOCAL_CONTAINER}" pg_restore \
    -U "${LOCAL_DB_USER}" \
    -d "${LOCAL_DB_NAME}" \
    --no-owner --no-acl \
    --clean --if-exists \
    < "${file}"
  local rc=$?
  set -e
  # pg_restore often returns 1 on benign warnings
  if [ "$rc" -gt 1 ]; then
    err "pg_restore failed (exit ${rc})"
  fi

  local users
  users="$(docker exec "${LOCAL_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -t -A -c 'SELECT count(*) FROM "User";' 2>/dev/null || echo "?")"
  log "恢复完成。User count = ${users}"

  cat <<EOF

  ╔════════════════════════════════════════════════════╗
  ║  本地生产镜像库已就绪                              ║
  ╠════════════════════════════════════════════════════╣
  ║  DATABASE_URL=postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASS}@127.0.0.1:${LOCAL_PORT}/${LOCAL_DB_NAME}
  ║  psql:   bash scripts/pull-prod-db.sh psql
  ║  verify: bash scripts/pull-prod-db.sh verify local
  ║
  ║  启动 App 连镜像库（自动切 provider / 退出还原）:
  ║    npm run dev:mirror
  ║  日常开发仍用: npm run dev  （SQLite）
  ╚════════════════════════════════════════════════════╝

EOF
}

# ── verify ───────────────────────────────────────────────
cmd_verify() {
  local target="${ARG2:-remote}"
  log "运行一致性校验 (target=${target})..."

  if [ "${target}" = "local" ]; then
    docker ps --format '{{.Names}}' | grep -qx "${LOCAL_CONTAINER}" \
      || err "本地容器 ${LOCAL_CONTAINER} 未运行。先: bash scripts/pull-prod-db.sh restore"

    # Run same SQL as remote helper via local container
    docker exec -i "${LOCAL_CONTAINER}" \
      psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'users_by_role' AS check_id, role AS k, count(*)::text AS v FROM "User" GROUP BY role
UNION ALL
SELECT 'users_status', status, count(*)::text FROM "User" GROUP BY status
UNION ALL
SELECT 'campaigns', COALESCE(type,'null') || '/' || COALESCE(status,'null'), count(*)::text FROM "Campaign" GROUP BY type, status
UNION ALL
SELECT 'vouchers_status', COALESCE(status,'null'), count(*)::text FROM "Voucher" GROUP BY status
UNION ALL
SELECT 'token_accounts', 'count', count(*)::text FROM "TokenAccount"
UNION ALL
SELECT 'token_balance_sum', 'sum', COALESCE(sum(balance),0)::text FROM "TokenAccount"
UNION ALL
SELECT 'stores', 'count', count(*)::text FROM "Store"
UNION ALL
SELECT 'memberships', 'count', count(*)::text FROM "Membership"
UNION ALL
SELECT 'settlements_status', COALESCE(status,'null'), count(*)::text FROM "Settlement" GROUP BY status
UNION ALL
SELECT 'orphan_vouchers', 'customer_missing', count(*)::text
  FROM "Voucher" v LEFT JOIN "User" u ON u.id = v."customerId" WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_stores', 'business_missing', count(*)::text
  FROM "Store" s LEFT JOIN "User" u ON u.id = s."businessId" WHERE u.id IS NULL
UNION ALL
SELECT 'token_account_without_user', 'count', count(*)::text
  FROM "TokenAccount" t LEFT JOIN "User" u ON u.id = t."userId" WHERE u.id IS NULL
UNION ALL
SELECT 'users_without_token_account', 'business_or_customer', count(*)::text
  FROM "User" u
  LEFT JOIN "TokenAccount" t ON t."userId" = u.id
  WHERE u.role IN ('business','customer') AND t.id IS NULL
ORDER BY 1, 2;
SQL
  else
    resolve_key
    ssh_ok
    sync_remote_helper
    remote_run verify
  fi
}

# ── psql local ───────────────────────────────────────────
cmd_psql() {
  docker ps --format '{{.Names}}' | grep -qx "${LOCAL_CONTAINER}" \
    || err "本地容器未运行。先: bash scripts/pull-prod-db.sh restore"
  log "进入本地镜像库 psql..."
  docker exec -it "${LOCAL_CONTAINER}" psql -U "${LOCAL_DB_USER}" -d "${LOCAL_DB_NAME}"
}

# ── uploads（品牌 logo 等；DB dump 不含文件）──────────────
# 生产落盘: /var/www/wemembers/data/uploads/{brands,receipts}/...
# 本机:     public/uploads/...
cmd_uploads() {
  resolve_key
  ssh_ok
  local remote_root="/var/www/wemembers/data/uploads"
  local local_root="${ROOT}/public/uploads"
  local scope="${ARG2:-brands}" # brands | all | receipts

  mkdir -p "${local_root}"

  if [ "${scope}" = "all" ]; then
    log "同步生产 uploads 全部 → ${local_root}"
    rsync -az --info=stats2 \
      -e "ssh ${SSH_OPTS[*]}" \
      "${SERVER_USER}@${SERVER_HOST}:${remote_root}/" \
      "${local_root}/" \
      || err "rsync uploads 失败"
  elif [ "${scope}" = "receipts" ]; then
    log "同步生产 uploads/receipts → ${local_root}/receipts"
    mkdir -p "${local_root}/receipts"
    rsync -az --info=stats2 \
      -e "ssh ${SSH_OPTS[*]}" \
      "${SERVER_USER}@${SERVER_HOST}:${remote_root}/receipts/" \
      "${local_root}/receipts/" \
      || err "rsync receipts 失败"
  else
    log "同步生产 uploads/brands → ${local_root}/brands"
    mkdir -p "${local_root}/brands"
    rsync -az --info=stats2 \
      -e "ssh ${SSH_OPTS[*]}" \
      "${SERVER_USER}@${SERVER_HOST}:${remote_root}/brands/" \
      "${local_root}/brands/" \
      || err "rsync brands 失败"
  fi

  local n
  n="$(find "${local_root}" -type f 2>/dev/null | wc -l | tr -d ' ')"
  log "本地 public/uploads 文件数: ${n}"
  log "也可用 npm run dev:mirror（NEXT_PUBLIC_MIRROR_ASSET_ORIGIN 回源生产，可不拉文件）"
}

usage() {
  cat <<EOF
Usage: bash scripts/pull-prod-db.sh <command>

Commands:
  summary                 远程只读摘要 → tmp/prod-dumps/summary-latest.json
  dump                    pg_dump 下载到 tmp/prod-dumps/（custom + sql.gz）
  full                    dump + summary
  restore [file]          恢复到本地 Docker Postgres :${LOCAL_PORT}
  verify [remote|local]   一致性 / 同步状态 SQL 检查
  psql                    进入本地镜像库交互式 psql
  uploads [brands|all|receipts]
                          同步生产上传文件到 public/uploads（默认 brands）

Examples:
  npm run db:prod-summary
  npm run db:pull-prod
  bash scripts/pull-prod-db.sh restore
  bash scripts/pull-prod-db.sh uploads brands
  bash scripts/pull-prod-db.sh verify remote
EOF
}

case "${MODE}" in
  summary)
    resolve_key; ssh_ok
    cmd_summary
    ;;
  dump|full)
    resolve_key; ssh_ok
    cmd_dump
    ;;
  restore)
    cmd_restore
    ;;
  uploads)
    cmd_uploads
    ;;
  verify)
    cmd_verify
    ;;
  psql)
    cmd_psql
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    err "未知命令: ${MODE}"
    ;;
esac
