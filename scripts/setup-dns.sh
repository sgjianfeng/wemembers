#!/bin/bash
# ============================================================
# wemembers.store - DNS 配置脚本
# 使用阿里云 OpenAPI 添加 DNS A 记录
#
# 前置条件:
#   1. 在阿里云控制台创建 AccessKey:
#      https://ram.console.aliyun.com/manage/ak
#   2. 设置环境变量:
#      export ALIYUN_ACCESS_KEY_ID="your-key-id"
#      export ALIYUN_ACCESS_KEY_SECRET="your-key-secret"
#
# 用法:
#   source <(cat scripts/setup-dns.env)  # 先设置 Key
#   bash scripts/setup-dns.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DOMAIN="wemembers.store"
SERVER_IP="43.106.94.37"
REGION="cn-hangzhou"  # DNS API 固定用杭州

# ── 参数 ──────────────────────────────────────────────
ALIYUN_KEY_ID="${ALIYUN_ACCESS_KEY_ID:-}"
ALIYUN_KEY_SECRET="${ALIYUN_ACCESS_KEY_SECRET:-}"

if [ -z "${ALIYUN_KEY_ID}" ] || [ -z "${ALIYUN_KEY_SECRET}" ]; then
    echo ""
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║  需要阿里云 AccessKey                     ║"
    echo "  ╠══════════════════════════════════════════╣"
    echo "  ║                                          ║"
    echo "  ║  1. 打开: https://ram.console.aliyun.com/manage/ak"
    echo "  ║  2. 创建 AccessKey                       ║"
    echo "  ║  3. 运行:                                ║"
    echo "  ║     export ALIYUN_ACCESS_KEY_ID=\"...\"    ║"
    echo "  ║     export ALIYUN_ACCESS_KEY_SECRET=\"...\"║"
    echo "  ║     bash scripts/setup-dns.sh            ║"
    echo "  ║                                          ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo ""
    exit 1
fi

log "使用 OpenAPI 配置 DNS..."
echo "  Domain: ${DOMAIN}"
echo "  IP:     ${SERVER_IP}"
echo ""

# ── 阿里云 API 签名函数 ───────────────────────────────────
# 使用阿里云 V3 签名 (更简单)
aliyun_api() {
    local ACTION="$1"
    local BODY="$2"

    # 构建请求
    curl -s "https://dns.aliyuncs.com/?Action=${ACTION}&${BODY}" \
        -H "Authorization: Bearer ${ALIYUN_KEY_ID}:${ALIYUN_KEY_SECRET}" \
        2>/dev/null || {
        # 如果 V3 不行, 试试用 aliyun CLI (如果安装了)
        warn "直接 API 调用失败, 尝试其他方式..."
        return 1
    }
}

# ── 实际实现用 Python 签名 ─────────────────────────────────
# (阿里云 V3 签名比较复杂, 用 Python 更可靠)
add_dns_record() {
    python3 - "$@" << 'PYTHON_SCRIPT'
import hashlib, hmac, json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timezone

access_key_id = os.environ.get("ALIYUN_ACCESS_KEY_ID", "")
access_key_secret = os.environ.get("ALIYUN_ACCESS_KEY_SECRET", "")

if not access_key_id or not access_key_secret:
    print("请设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET")
    sys.exit(1)

# 阿里云 DNS API
# 使用 HTTP (非 HTTPS) 签名方式

def sign_aliyun_v3(method, params):
    """阿里云 V3 签名"""
    import urllib.parse

    # 公共参数
    params["Format"] = "JSON"
    params["Version"] = "2015-01-09"
    params["AccessKeyId"] = access_key_id
    params["SignatureMethod"] = "HMAC-SHA1"
    params["Timestamp"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    params["SignatureVersion"] = "1.0"
    params["SignatureNonce"] = os.urandom(16).hex()

    # 排序参数
    sorted_params = sorted(params.items(), key=lambda x: x[0])

    # 构造规范化字符串
    canonicalized = "&".join([
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(str(v), safe='')}"
        for k, v in sorted_params
    ])

    string_to_sign = f"{method}&{urllib.parse.quote('/', safe='')}&{urllib.parse.quote(canonicalized, safe='')}"

    # HMAC-SHA1 签名
    key = (access_key_secret + "&").encode("utf-8")
    signature = hmac.new(key, string_to_sign.encode("utf-8"), hashlib.sha1).digest()
    import base64
    return base64.b64encode(signature).decode("utf-8")

def call_aliyun(action, specific_params):
    """调用阿里云 API"""
    params = {
        "Action": action,
    }
    params.update(specific_params)

    signature = sign_aliyun_v3("GET", params)
    params["Signature"] = signature

    query_string = urllib.parse.urlencode(params)
    url = f"https://dns.aliyuncs.com/?{query_string}"

    try:
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read().decode("utf-8"))
        return result
    except Exception as e:
        print(f"API 调用失败: {e}")
        return None

# ── 1. 获取域名信息 ──
print("获取域名信息...")
result = call_aliyun("DescribeDomainRecords", {
    "DomainName": "wemembers.store",
})
if result:
    records = result.get("DomainRecords", {}).get("Record", [])
    print(f"  当前解析记录数: {len(records)}")
    for r in records:
        print(f"    {r.get('RR')}.{r.get('DomainName')} → {r.get('Value')} ({r.get('Type')})")

# ── 2. 添加 A 记录 ──
print("\n添加 A 记录: wemembers.store → 43.106.94.37")
result = call_aliyun("AddDomainRecord", {
    "DomainName": "wemembers.store",
    "RR": "@",
    "Type": "A",
    "Value": "43.106.94.37",
    "TTL": "600",
})

if result:
    record_id = result.get("RecordId", "")
    print(f"  ✅ A 记录添加成功! RecordId: {record_id}")
else:
    print("  ❌ 添加失败，请检查 AccessKey 权限")
    sys.exit(1)

# ── 3. 添加 www 子域名记录 ──
print("添加 A 记录: www.wemembers.store → 43.106.94.37")
result = call_aliyun("AddDomainRecord", {
    "DomainName": "wemembers.store",
    "RR": "www",
    "Type": "A",
    "Value": "43.106.94.37",
    "TTL": "600",
})
if result:
    print(f"  ✅ WWW A 记录添加成功! RecordId: {result.get('RecordId')}")
else:
    print("  ⚠️ WWW 记录添加失败 (可能已存在)")

print("\n✅ DNS 配置完成!")
print(f"  wemembers.store    → 43.106.94.37")
print(f"  www.wemembers.store → 43.106.94.37")
print("\nDNS 解析生效需要 1-10 分钟。")
PYTHON_SCRIPT
}

# ── 执行 ──
log "执行 DNS 配置..."
add_dns_record

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  DNS 配置完成!                           ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  wemembers.store → 43.106.94.37         ║"
echo "  ║  www.wemembers.store → 43.106.94.37     ║"
echo "  ║  (等待 1-10 分钟生效)                     ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
