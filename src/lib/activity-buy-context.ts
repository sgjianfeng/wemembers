/**
 * 活动购券语境：门店货架 / 国庆 / 品牌页 → 统一 /voucher 执行页
 * 用 query 保持「仍在某活动里」，避免跳戏。
 */

export type ActivityBuyFrom = "store" | "ndp" | "shop" | "home";

export type ActivityBuyContext = {
  from: ActivityBuyFrom;
  /** 活动 campaign id */
  activityId?: string;
  activitySlug?: string | null;
  activityName?: string | null;
  /** 门店货架路径，如 /shop/meow/vivo */
  storePath?: string | null;
  storeName?: string | null;
  brandName?: string | null;
  /** 国庆专用 */
  ndpSlug?: string | null;
  ndpFrom?: "table" | "counter" | string | null;
  minSpendSgd?: number | null;
  giftSgd?: number | null;
};

/** 在可购产品 buyPath 上附加语境参数 */
export function withActivityBuyContext(
  buyPathOrVoucherSlug: string | null | undefined,
  ctx: ActivityBuyContext
): string | null {
  if (!buyPathOrVoucherSlug) return null;
  const base = buyPathOrVoucherSlug.startsWith("/")
    ? buyPathOrVoucherSlug
    : `/voucher/${buyPathOrVoucherSlug}`;

  // 已有 query 时合并
  const [path, existing] = base.split("?");
  const q = new URLSearchParams(existing || "");
  q.set("from", ctx.from);
  if (ctx.activityId) q.set("activity", ctx.activityId);
  if (ctx.activitySlug) q.set("activitySlug", ctx.activitySlug);
  if (ctx.activityName) q.set("activityName", ctx.activityName);
  if (ctx.storePath) q.set("store", ctx.storePath);
  if (ctx.storeName) q.set("storeName", ctx.storeName);
  if (ctx.brandName) q.set("brand", ctx.brandName);
  if (ctx.ndpSlug) q.set("ndp", ctx.ndpSlug);
  if (ctx.ndpFrom) q.set("ndpFrom", ctx.ndpFrom);
  if (ctx.minSpendSgd != null && ctx.minSpendSgd > 0) {
    q.set("min", String(ctx.minSpendSgd));
  }
  if (ctx.giftSgd != null && ctx.giftSgd > 0) {
    q.set("gift", String(ctx.giftSgd));
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function parseActivityBuyContext(
  sp: URLSearchParams | { get(name: string): string | null }
): ActivityBuyContext & { isContextual: boolean } {
  const fromRaw = sp.get("from") || "";
  // join 结账入口视同门店语境
  const fromNorm =
    fromRaw === "join" && sp.get("store")?.startsWith("/shop/")
      ? "store"
      : fromRaw;
  const from = (
    ["store", "ndp", "shop", "home"].includes(fromNorm) ? fromNorm : ""
  ) as ActivityBuyFrom | "";
  const ctx: ActivityBuyContext = {
    from: (from || "home") as ActivityBuyFrom,
    activityId: sp.get("activity") || undefined,
    activitySlug: sp.get("activitySlug"),
    activityName: sp.get("activityName"),
    storePath: sp.get("store"),
    storeName: sp.get("storeName"),
    brandName: sp.get("brand"),
    ndpSlug: sp.get("ndp"),
    ndpFrom: sp.get("ndpFrom"),
    minSpendSgd: sp.get("min") ? Number(sp.get("min")) : null,
    giftSgd: sp.get("gift") ? Number(sp.get("gift")) : null,
  };
  return {
    ...ctx,
    isContextual: from === "ndp" || from === "store" || from === "shop",
  };
}

/** 返回上一层：门店 / 国庆 / 品牌 */
export function activityBuyBackHref(ctx: ActivityBuyContext): string {
  // 国庆购券：优先回门店货架（从店进国庆再进购券），否则回 NDP 落地页
  if (ctx.from === "ndp") {
    if (ctx.storePath && ctx.storePath.startsWith("/shop/")) {
      return ctx.storePath;
    }
    if (ctx.ndpSlug) {
      const f = ctx.ndpFrom || "table";
      const q = new URLSearchParams({ from: f });
      if (ctx.storePath?.startsWith("/shop/")) q.set("store", ctx.storePath);
      if (ctx.storeName) q.set("storeName", ctx.storeName);
      if (ctx.brandName) q.set("brand", ctx.brandName);
      return `/ndp/${encodeURIComponent(ctx.ndpSlug)}?${q.toString()}`;
    }
  }
  if ((ctx.from === "store" || ctx.from === "shop") && ctx.storePath) {
    return ctx.storePath.startsWith("/")
      ? ctx.storePath
      : `/${ctx.storePath}`;
  }
  return "/";
}

/** Stripe success/cancel 允许回传的语境 key（防任意 redirect） */
const RETURN_QUERY_ALLOW = new Set([
  "from",
  "activity",
  "activitySlug",
  "activityName",
  "store",
  "storeName",
  "brand",
  "ndp",
  "ndpFrom",
  "min",
  "gift",
  "seller",
  "amount",
]);

/**
 * 从当前购券页 searchParams / body 抽出可安全拼进 Stripe 回调 URL 的 query。
 * 不含 paid / session_id（由 success_url 自己加）。
 */
export function sanitizeCheckoutReturnQuery(
  input: Record<string, unknown> | URLSearchParams | null | undefined
): string {
  if (!input) return "";
  const q = new URLSearchParams();
  const get = (k: string): string | null => {
    if (input instanceof URLSearchParams) return input.get(k);
    const v = (input as Record<string, unknown>)[k];
    if (v == null) return null;
    return String(v);
  };
  for (const key of RETURN_QUERY_ALLOW) {
    const raw = get(key);
    if (raw == null || raw === "") continue;
    // store path 必须是站内 /shop/... 避免 open redirect
    if (key === "store") {
      if (!raw.startsWith("/shop/")) continue;
      if (raw.includes("//") || raw.includes("\\")) continue;
    }
    if (raw.length > 200) continue;
    q.set(key, raw);
  }
  return q.toString();
}

/** 拼 Stripe 回跳 URL：保留活动/门店语境 */
export function buildVoucherReturnUrl(
  origin: string,
  slug: string,
  opts: { paid: "0" | "1"; returnQuery?: string }
): string {
  const base = `${origin.replace(/\/$/, "")}/voucher/${encodeURIComponent(slug)}`;
  const q = new URLSearchParams();
  if (opts.returnQuery) {
    const extra = new URLSearchParams(opts.returnQuery);
    extra.forEach((v, k) => {
      if (RETURN_QUERY_ALLOW.has(k) && k !== "paid" && k !== "session_id") {
        q.set(k, v);
      }
    });
  }
  q.set("paid", opts.paid);
  // Stripe 要求字面量 {CHECKOUT_SESSION_ID} 不被 encode
  if (opts.paid === "1") {
    const qs = q.toString();
    return `${base}?${qs}&session_id={CHECKOUT_SESSION_ID}`;
  }
  return `${base}?${q.toString()}`;
}
