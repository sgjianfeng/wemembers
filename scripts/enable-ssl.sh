#!/bin/bash
# ============================================================
# wemembers.store — Enable HTTPS via Let's Encrypt
# Run on the production server: bash scripts/enable-ssl.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DOMAIN="wemembers.store"
WWW_DOMAIN="www.${DOMAIN}"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  wemembers.store — Enable HTTPS         ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 1. Install certbot ──
if ! command -v certbot &> /dev/null; then
  log "Installing certbot..."
  if command -v apt &> /dev/null; then
    apt update -qq && apt install -y certbot python3-certbot-nginx 2>&1 | tail -3
  elif command -v yum &> /dev/null; then
    yum install -y certbot python3-certbot-nginx 2>&1 | tail -3
  else
    err "Cannot detect package manager. Install certbot manually."
  fi
fi
log "certbot $(certbot --version | head -1)"

# ── 2. Ensure port 80 is accessible ──
log "Checking port 80..."
if curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}" | grep -qE "^(200|301|302)$"; then
  log "Port 80 accessible — Let's Encrypt challenge will work"
else
  warn "Port 80 may not be accessible. ACME challenge needs HTTP on port 80."
  echo "   Make sure your firewall allows: 80, 443"
fi

# ── 3. Get certificate ──
log "Requesting SSL certificate for ${DOMAIN} and ${WWW_DOMAIN}..."
certbot --nginx \
  -d "${DOMAIN}" \
  -d "${WWW_DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "wemembers.platform@wemembers.store" \
  --redirect 2>&1 || {
    warn "Non-interactive mode failed. Trying interactive..."
    certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}"
  }

# ── 4. Verify auto-renewal ──
log "Setting up auto-renewal..."
certbot renew --dry-run 2>&1 | tail -3
log "Certificate auto-renewal configured (systemd timer or cron)"

# ── 5. Test HTTPS ──
log "Testing HTTPS..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}" 2>/dev/null || echo "000")
if [ "${HTTP_CODE}" = "200" ]; then
  log "HTTPS is working! (HTTP ${HTTP_CODE})"
else
  warn "HTTPS returned ${HTTP_CODE} — may need DNS propagation. Check in 5 min."
fi

echo ""
echo "  ✅ SSL setup complete!"
echo "  🌐 https://${DOMAIN}"
echo ""
