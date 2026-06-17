#!/bin/bash
# ============================================================
# wemembers.store - 服务器初始化脚本
# 在 ECS 服务器上运行此脚本来设置环境
#
# 用法 (在服务器上):
#   curl -fsSL https://...  | bash
#   或
#   ssh root@43.106.94.37 'bash -s' < scripts/server-init.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  wemembers.store - Server Setup          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 1. 基础环境 ──────────────────────────────────────────
log "Installing base packages..."

# 安装 Node.js 20 LTS (如果未安装)
if ! command -v node &> /dev/null; then
    warn "Node.js not found, installing Node.js 20 LTS..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
fi
log "Node.js $(node -v)"

# 安装 PM2
if ! command -v pm2 &> /dev/null; then
    warn "PM2 not found, installing..."
    npm install -g pm2
fi
log "PM2 $(pm2 -v)"

# 安装其他工具
yum install -y git nginx certbot python3-certbot-nginx 2>/dev/null || true
log "Base packages installed"

# ── 2. Nginx 配置 ──────────────────────────────────────────
log "Configuring Nginx..."

# 创建 wemembers Nginx 配置
cat > /etc/nginx/conf.d/wemembers.conf << 'NGINX_CONF'
# wemembers.store - Nginx Virtual Host

upstream wemembers_app {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name wemembers.store www.wemembers.store;

    # 如果有 SSL 证书，取消下面注释并注释掉上面的 listen 80
    # listen 443 ssl http2;
    # ssl_certificate     /etc/nginx/ssl/wemembers.store.pem;
    # ssl_certificate_key /etc/nginx/ssl/wemembers.store.key;
    #
    # # 将 HTTP 重定向到 HTTPS
    # if ($scheme = http) {
    #     return 301 https://$server_name$request_uri;
    # }

    root /var/www/wemembers/current/public;

    # 静态文件 (Next.js public 目录)
    location /_next/static {
        alias /var/www/wemembers/current/.next/static;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    location /static {
        alias /var/www/wemembers/current/public;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Favicon 和 robots
    location = /favicon.ico {
        alias /var/www/wemembers/current/public/favicon.ico;
        expires 7d;
    }

    location = /robots.txt {
        alias /var/www/wemembers/current/public/robots.txt;
        expires 1d;
    }

    # 反向代理到 Next.js
    location / {
        proxy_pass http://wemembers_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
}
NGINX_CONF

log "Nginx config created at /etc/nginx/conf.d/wemembers.conf"

# ── 3. 应用目录结构 ──────────────────────────────────────
log "Creating application directories..."

mkdir -p /var/www/wemembers/releases
mkdir -p /var/www/wemembers/data
mkdir -p /var/www/wemembers/current

log "App directories created"

# ── 4. 创建生产环境 .env 模板 ──────────────────────────────
log "Creating .env template (PLEASE EDIT THIS FILE)..."

cat > /var/www/wemembers/.env.template << 'ENV_TEMPLATE'
# wemembers.store - Production Environment Variables
# ⚠️  复制此文件为 .env 并填入真实值: cp .env.template .env

# 数据库 (SQLite - 文件路径)
DATABASE_URL="file:/var/www/wemembers/data/production.db"

# JWT 密钥 (⚠️ 务必改成随机字符串!)
JWT_SECRET="change-me-to-a-random-string-at-least-32-characters-long!!"

# App URL
NEXT_PUBLIC_APP_URL="https://wemembers.store"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# AI (可选)
DEEPSEEK_API_KEY=""
ENV_TEMPLATE

# 如果 .env 不存在，从模板创建
if [ ! -f /var/www/wemembers/.env ]; then
    cp /var/www/wemembers/.env.template /var/www/wemembers/.env
    warn "Created .env from template. PLEASE edit /var/www/wemembers/.env with real values!"
fi

# ── 5. SSL 证书 (Let's Encrypt) ────────────────────────────
log "Setting up SSL..."
mkdir -p /etc/nginx/ssl

# 先确保 Nginx 能启动 (只用 HTTP)
nginx -t && systemctl reload nginx 2>/dev/null || warn "Nginx config test failed. Will fix after DNS resolves."

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         Server Setup Complete! ✅         ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║                                          ║"
echo "  ║  Next steps:                             ║"
echo "  ║  1. Edit /var/www/wemembers/.env         ║"
echo "  ║  2. Run: certbot --nginx -d wemembers.store"
echo "  ║     (after DNS is pointing here)         ║"
echo "  ║  3. Run the deploy script                ║"
echo "  ║  4. pm2 status                           ║"
echo "  ║  5. pm2 logs wemembers                   ║"
echo "  ║                                          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 6. PM2 开机自启 ──────────────────────────────────────
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log "PM2 startup configured"
