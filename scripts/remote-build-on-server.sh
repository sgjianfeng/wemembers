#!/bin/bash
# 在生产服务器上执行：构建 standalone → 打 release → 切换 PM2
# 由 scripts/deploy-remote.sh 经 SSH 调用，也可手动：
#   RELEASE_NAME=release-manual bash /var/www/wemembers/repo/scripts/remote-build-on-server.sh
set -euo pipefail

APP="${SERVER_APP_DIR:-/var/www/wemembers}"
REPO="${SERVER_REPO_DIR:-${APP}/repo}"
RELEASE_NAME="${RELEASE_NAME:-release-$(date +%Y%m%d-%H%M%S)}"
RELEASE_DIR="${APP}/releases/${RELEASE_NAME}"

echo "  app=${APP}"
echo "  repo=${REPO}"
echo "  release=${RELEASE_NAME}"

cd "${REPO}"

# 生产 schema 必须用 postgresql
if grep -q 'provider = "sqlite"' prisma/schema.prisma; then
  echo "  prisma provider: sqlite → postgresql"
  sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
  rm -f prisma/schema.prisma.bak
fi

if [ -f package-lock.json ]; then
  echo "  npm ci..."
  npm ci --no-audit --no-fund
else
  echo "  npm install..."
  npm install --no-audit --no-fund
fi

echo "  prisma generate..."
npx prisma generate

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
# build 期占位；运行时用 APP/.env
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:placeholder@127.0.0.1:5432/postgres}"

echo "  next build (standalone)..."
rm -rf .next
npx next build

echo "  assemble release..."
mkdir -p "${RELEASE_DIR}"

if [ ! -d .next/standalone ]; then
  echo "  ERROR: .next/standalone missing — check next.config output:standalone"
  exit 1
fi

cp -a .next/standalone/. "${RELEASE_DIR}/"
mkdir -p "${RELEASE_DIR}/.next"
cp -a .next/static "${RELEASE_DIR}/.next/" 2>/dev/null || true
cp -a public "${RELEASE_DIR}/" 2>/dev/null || true
cp -a prisma "${RELEASE_DIR}/" 2>/dev/null || true

if [ -d node_modules/.prisma ]; then
  mkdir -p "${RELEASE_DIR}/node_modules"
  cp -a node_modules/.prisma "${RELEASE_DIR}/node_modules/" 2>/dev/null || true
  cp -a node_modules/@prisma "${RELEASE_DIR}/node_modules/" 2>/dev/null || true
fi

ln -sfn "${APP}/.env" "${RELEASE_DIR}/.env"

echo "  prisma self-check..."
cd "${RELEASE_DIR}"
node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.user
  .count()
  .then((n) => {
    console.log("  prisma ok, users=", n);
    return p.$disconnect();
  })
  .catch((e) => {
    console.error("  prisma fail:", e.message);
    process.exit(1);
  });
NODE

echo "  switch + pm2..."
ln -sfn "${RELEASE_DIR}" "${APP}/current"
cd "${APP}/current"

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

pm2 delete wemembers 2>/dev/null || true

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}
const cwd = process.cwd();
const cfg = {
  apps: [
    {
      name: "wemembers",
      script: cwd + "/server.js",
      cwd,
      interpreter: "node",
      env,
    },
  ],
};
fs.writeFileSync(
  "/tmp/wemembers-ecosystem.config.cjs",
  "module.exports = " + JSON.stringify(cfg, null, 2) + ";\n"
);
console.log(
  "  ecosystem ok; STRIPE_WEBHOOK_SECRET len=",
  (env.STRIPE_WEBHOOK_SECRET || "").length
);
NODE

pm2 start /tmp/wemembers-ecosystem.config.cjs
pm2 save

cd "${APP}/releases"
ls -1t | tail -n +6 | xargs -r rm -rf

echo "  released: ${RELEASE_NAME}"
