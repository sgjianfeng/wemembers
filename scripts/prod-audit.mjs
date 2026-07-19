/**
 * Production surface audit — pages + key APIs
 * Exit 0 always; prints JSON summary
 */
const BASE = process.env.BASE || "https://wemembers.store";

const PAGES = [
  "/", "/for-business", "/auth/login", "/auth/register",
  "/auth/login?tab=customer", "/auth/register?role=customer",
  "/auth/login?tab=business", "/auth/register?role=business",
  "/home", "/wallet", "/balance", "/profile", "/my-tokens",
  "/business", "/business/stores", "/business/campaigns",
  "/business/campaigns/new", "/business/coupons", "/business/scan",
  "/business/settings", "/business/members", "/business/physical",
  "/business/tokens", "/business/settlements",
  "/voucher/meow-bbq-s10-voucher", "/voucher/meow-bbq-draw-3tier",
  "/shop/meow-bbq", "/api/health",
];

const APIS = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/campaign/active-draws" },
  { method: "GET", path: "/api/coupons/discover" },
  { method: "GET", path: "/api/campaign/pool-status?slug=meow-bbq-draw-3tier" },
  { method: "POST", path: "/api/auth/send-code", body: { contact: "91251676", purpose: "login" } },
  { method: "POST", path: "/api/auth/send-code", body: { contact: "9" + Date.now().toString().slice(-7), purpose: "register" } },
];

function classify(status, url, bodyText) {
  const issues = [];
  if (status >= 500) issues.push("HTTP_5XX");
  if (status === 0) issues.push("NETWORK");
  if (/Application error|Internal Server Error|PrismaClient|auth\.[a-z]+\.[a-z]+/i.test(bodyText)) {
    if (/auth\.[a-z]+\.[a-z]+/.test(bodyText) && !bodyText.includes("创建账号") && url.includes("/auth"))
      issues.push("I18N_KEY_LEAK");
    if (/Application error|Internal Server Error|PrismaClient/i.test(bodyText))
      issues.push("ERROR_BODY");
  }
  return issues;
}

const results = { pages: [], apis: [], at: new Date().toISOString(), base: BASE };

for (const path of PAGES) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "manual",
      headers: { "User-Agent": "WeMembers-Audit/1.0" },
    });
    let text = "";
    try { text = await res.text(); } catch {}
    const loc = res.headers.get("location") || "";
    const issues = classify(res.status, path, text.slice(0, 3000));
    // protected routes: 307 to login is expected
    const protectedish = ["/home","/wallet","/balance","/profile","/my-tokens","/business"].some(p => path === p || path.startsWith(p + "/"));
    if (protectedish && (res.status === 307 || res.status === 302) && loc.includes("/auth/login")) {
      // expected
    } else if (res.status >= 400 && res.status < 500 && !protectedish && path !== "/api/health") {
      if (res.status !== 404) issues.push("HTTP_4XX");
    }
    results.pages.push({
      path,
      status: res.status,
      location: loc || undefined,
      issues,
      ok: issues.length === 0 || (protectedish && (res.status === 307 || res.status === 302)),
    });
  } catch (e) {
    results.pages.push({ path, status: 0, issues: ["NETWORK"], ok: false, error: String(e.message) });
  }
}

for (const api of APIS) {
  try {
    const res = await fetch(`${BASE}${api.path}`, {
      method: api.method,
      headers: { "Content-Type": "application/json" },
      body: api.body ? JSON.stringify(api.body) : undefined,
    });
    let body;
    try { body = await res.json(); } catch { body = null; }
    const issues = [];
    if (res.status >= 500) issues.push("HTTP_5XX");
    results.apis.push({
      ...api,
      status: res.status,
      issues,
      ok: res.status < 500,
      sample: body && (body.error || body.data?.message || Object.keys(body).slice(0,3)),
    });
  } catch (e) {
    results.apis.push({ ...api, status: 0, issues: ["NETWORK"], ok: false, error: String(e.message) });
  }
}

const pageFail = results.pages.filter(p => !p.ok);
const apiFail = results.apis.filter(a => !a.ok);
console.log(JSON.stringify({
  summary: {
    pages: `${results.pages.length - pageFail.length}/${results.pages.length} ok`,
    apis: `${results.apis.length - apiFail.length}/${results.apis.length} ok`,
    pageFailures: pageFail,
    apiFailures: apiFail,
  },
  pages: results.pages,
  apis: results.apis,
}, null, 2));
