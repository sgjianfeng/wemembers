/**
 * 统一心智：活动（Campaign）= 容器；权益券 = 活动下的可操作权益
 * 客户首页 / 钱包 / 企业·门店「活动券」共用同一套分组语义
 */

export type EntitlementKind =
  | "gift_coupon" // 国庆 61 等固定面额赠券
  | "draw_entry" // 大奖资格（付费或赠送）
  | "prepaid" // 可花预付余额
  | "catalog"; // 企业侧：可售产品线（非顾客持有）

export type EntitlementTone = "gift" | "draw" | "prepaid" | "default";

export type ActivityTone = "ndp" | "draw" | "voucher" | "default";

export type EntitlementItem = {
  id: string;
  kind: EntitlementKind;
  tone: EntitlementTone;
  title: string;
  titleEn?: string;
  /** 主数字，如 S$61 / 权重 / 余额 */
  primaryLabel: string;
  secondaryLabel?: string;
  status?: string;
  href?: string | null;
  /** 企业侧操作 */
  ops?: { label: string; labelEn?: string; href: string }[];
};

export type ActivityBundle = {
  key: string;
  campaignId: string | null;
  title: string;
  businessName: string | null;
  businessLogo?: string | null;
  type: string | null;
  status?: string | null;
  tone: ActivityTone;
  /** 一句卖点 / 广告副文 */
  blurb: string;
  blurbEn?: string;
  /** 活动页 / 广告 CTA */
  href?: string | null;
  entitlements: EntitlementItem[];
  /** 是否「我的」（已参与）vs 发现广告 */
  joined?: boolean;
  /** 展示用计数摘要 */
  summary: string;
  summaryEn?: string;
  /** 企业操作条 */
  ops?: { label: string; labelEn?: string; href: string; primary?: boolean }[];
  /** 统计（企业） */
  stats?: { label: string; value: string }[];
};

export function activityToneFromType(
  type: string | null | undefined,
  name?: string | null,
  tags?: string | null,
  rulesSnapshot?: string | null
): ActivityTone {
  if (type === "holiday" || /国庆|ndp|national/i.test(name || "")) return "ndp";
  if (tags && /ndp|国庆|national|category:ndp/i.test(tags)) return "ndp";
  if (rulesSnapshot && type === "holiday" && /"ndp"/.test(rulesSnapshot))
    return "ndp";
  if (type === "lucky_draw" || type === "lucky_draw_v2") return "draw";
  if (tags && /exclusive_ballot|category:grand/i.test(tags)) return "draw";
  if (type === "voucher_sale") return "voucher";
  if (tags && /face_open|face_threshold|category:long/i.test(tags))
    return "voucher";
  return "default";
}

export function toneBarClass(tone: ActivityTone): string {
  switch (tone) {
    case "ndp":
      return "border-l-rose-500";
    case "draw":
      return "border-l-violet-500";
    case "voucher":
      return "border-l-[#1A6EFF]";
    default:
      return "border-l-slate-400";
  }
}

export function entitlementBarClass(tone: EntitlementTone): string {
  switch (tone) {
    case "gift":
      return "border-l-[#FF6B35]";
    case "draw":
      return "border-l-violet-500";
    case "prepaid":
      return "border-l-[#1A6EFF]";
    default:
      return "border-l-slate-300";
  }
}

export function kindLabel(
  kind: EntitlementKind,
  lang: "zh" | "en"
): string {
  const map: Record<EntitlementKind, { zh: string; en: string }> = {
    gift_coupon: { zh: "赠送券", en: "Gift coupon" },
    draw_entry: { zh: "抽奖资格", en: "Draw entry" },
    prepaid: { zh: "预付余额", en: "Prepaid" },
    catalog: { zh: "可售产品", en: "Product" },
  };
  return map[kind][lang];
}

/** 顾客侧：从 claims + draws + prepaid 合成活动包 */
export function buildCustomerActivityBundles(input: {
  claims: Array<{
    id: string;
    status: string;
    qrCode?: string;
    campaignId: string | null;
    campaignName: string | null;
    campaignType: string | null;
    businessName: string | null;
    title: string;
    valueCents: number;
    validUntil: string;
    href?: string | null;
  }>;
  draws: Array<{
    id: string;
    campaignId: string;
    campaignName: string | null;
    businessName: string | null;
    drawWeight: number;
    shortCode: string | null;
    isGiftEntry: boolean;
    balanceCents: number;
    amountCents: number;
    href?: string | null;
  }>;
  prepaid?: Array<{
    id: string;
    campaignId: string;
    campaignName: string | null;
    businessName: string | null;
    balanceCents: number;
    amountCents: number;
    href?: string | null;
  }>;
  lang: "zh" | "en";
}): ActivityBundle[] {
  const zh = input.lang === "zh";
  const map = new Map<string, ActivityBundle>();

  const ensure = (
    key: string,
    partial: Partial<ActivityBundle> & { title: string }
  ) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        campaignId: partial.campaignId ?? null,
        title: partial.title,
        businessName: partial.businessName ?? null,
        type: partial.type ?? null,
        tone: partial.tone ?? "default",
        blurb: partial.blurb ?? "",
        href: partial.href ?? null,
        entitlements: [],
        joined: true,
        summary: "",
      });
    }
    return map.get(key)!;
  };

  for (const c of input.claims) {
    const key = c.campaignId || `solo-claim-${c.id}`;
    const g = ensure(key, {
      campaignId: c.campaignId,
      title: c.campaignName || c.title,
      businessName: c.businessName,
      type: c.campaignType,
      tone: activityToneFromType(c.campaignType, c.campaignName),
      blurb: zh ? "活动赠送权益" : "Campaign gift",
    });
    g.entitlements.push({
      id: c.id,
      kind: "gift_coupon",
      tone: "gift",
      title: c.title,
      primaryLabel: `S$${(c.valueCents / 100).toFixed(0)}`,
      secondaryLabel: zh
        ? `有效至 ${new Date(c.validUntil).toLocaleDateString("zh-CN")}`
        : `Until ${new Date(c.validUntil).toLocaleDateString("en-SG")}`,
      status: c.status,
      href: c.href ?? `/redeem/${c.id}`,
    });
  }

  for (const d of input.draws) {
    const key = d.campaignId;
    const g = ensure(key, {
      campaignId: d.campaignId,
      title: d.campaignName || (zh ? "大奖活动" : "Grand draw"),
      businessName: d.businessName,
      type: "lucky_draw_v2",
      tone: d.isGiftEntry ? "ndp" : "draw",
      blurb: d.isGiftEntry
        ? zh
          ? "赠送抽奖 · 购券可获约 5 倍机会"
          : "Gift draw · buy for ~5× chance"
        : zh
          ? "购券大奖资格"
          : "Paid draw entry",
    });
    // 有余额的当作 prepaid 也列一条
    if (d.balanceCents > 0) {
      g.entitlements.push({
        id: `${d.id}-bal`,
        kind: "prepaid",
        tone: "prepaid",
        title: zh ? "预付余额" : "Prepaid balance",
        primaryLabel: `S$${(d.balanceCents / 100).toFixed(2)}`,
        secondaryLabel: zh
          ? `面值 S$${(d.amountCents / 100).toFixed(0)}`
          : `Face S$${(d.amountCents / 100).toFixed(0)}`,
        href: d.href ?? "/balance",
      });
    }
    g.entitlements.push({
      id: d.id,
      kind: "draw_entry",
      tone: "draw",
      title: d.isGiftEntry
        ? zh
          ? "赠送 · 大奖资格"
          : "Gift · Grand draw"
        : zh
          ? "购券 · 大奖资格"
          : "Paid · Grand draw",
      primaryLabel: d.isGiftEntry
        ? zh
          ? "1 次机会"
          : "1 chance"
        : `w=${d.drawWeight}`,
      secondaryLabel: d.shortCode
        ? `${zh ? "短码" : "Code"} ${d.shortCode}`
        : d.isGiftEntry
          ? zh
            ? "购券可获约 5 倍机会"
            : "~5× if you buy"
          : undefined,
      href: d.href ?? "/balance",
    });
  }

  for (const p of input.prepaid || []) {
    const key = p.campaignId;
    const g = ensure(key, {
      campaignId: p.campaignId,
      title: p.campaignName || (zh ? "预付活动" : "Prepaid"),
      businessName: p.businessName,
      type: "voucher_sale",
      tone: "voucher",
      blurb: zh ? "到店可花余额" : "Spend in-store",
    });
    if (!g.entitlements.some((e) => e.id === p.id || e.id === `${p.id}-bal`)) {
      g.entitlements.push({
        id: p.id,
        kind: "prepaid",
        tone: "prepaid",
        title: zh ? "预付余额" : "Prepaid balance",
        primaryLabel: `S$${(p.balanceCents / 100).toFixed(2)}`,
        secondaryLabel: zh
          ? `面值 S$${(p.amountCents / 100).toFixed(0)}`
          : `Face S$${(p.amountCents / 100).toFixed(0)}`,
        href: p.href ?? "/balance",
      });
    }
  }

  for (const g of map.values()) {
    const n = g.entitlements.length;
    g.summary = zh ? `${n} 项权益` : `${n} entitlement${n === 1 ? "" : "s"}`;
    g.summaryEn = g.summary;
  }

  return Array.from(map.values()).sort((a, b) => {
    const score = (x: ActivityBundle) =>
      (x.tone === "ndp" ? 20 : 0) +
      (x.campaignId ? 10 : 0) +
      x.entitlements.length;
    return score(b) - score(a);
  });
}

/** 发现/广告位：可参与活动（无持仓时仍展示）；可带产品线作「权益行」 */
export function buildDiscoverActivityBundles(
  activities: Array<{
    id: string;
    name: string;
    businessName?: string | null;
    type?: string | null;
    href: string;
    blurb?: string;
    joined?: boolean;
    kindTag?: string;
    products?: Array<{
      id: string;
      name: string;
      slug?: string | null;
      type?: string | null;
      buyPath?: string | null;
    }>;
  }>,
  lang: "zh" | "en"
): ActivityBundle[] {
  const zh = lang === "zh";
  return activities.map((a) => {
    const tone = activityToneFromType(a.type || a.kindTag, a.name);
    const entitlements: EntitlementItem[] = (a.products || []).map((p) => {
      const isDraw =
        (p.type || "").includes("lucky_draw") ||
        tone === "draw" ||
        tone === "ndp";
      return {
        id: p.id,
        kind: isDraw ? "draw_entry" : "catalog",
        tone: isDraw ? "draw" : "prepaid",
        title: p.name,
        primaryLabel: zh ? "可购买" : "Available",
        secondaryLabel: isDraw
          ? zh
            ? "购券进大奖池"
            : "Buy to enter pool"
          : zh
            ? "到店可花余额"
            : "Spend in-store",
        href: p.buyPath || (p.slug ? `/voucher/${p.slug}` : a.href),
      };
    });

    // 国庆无产品线时补两行权益说明
    if (tone === "ndp" && entitlements.length === 0) {
      entitlements.push(
        {
          id: `${a.id}-gift`,
          kind: "gift_coupon",
          tone: "gift",
          title: zh ? "国庆赠送券 S$61" : "NDP gift S$61",
          primaryLabel: "S$61",
          secondaryLabel: zh
            ? "满120领取 · 自领起30天"
            : "Spend 120 · 30d from claim",
          href: a.href,
        },
        {
          id: `${a.id}-draw`,
          kind: "draw_entry",
          tone: "draw",
          title: zh ? "大奖抽奖机会" : "Grand draw chance",
          primaryLabel: zh ? "1 次+" : "1+",
          secondaryLabel: zh
            ? "购券约 5 倍 · 赠送较弱"
            : "Buy ~5× · gift weaker",
          href: a.href,
        }
      );
    }

    const n = entitlements.length;
    return {
      key: `discover-${a.id}`,
      campaignId: a.id,
      title: a.name,
      businessName: a.businessName || null,
      type: a.type || null,
      tone,
      blurb:
        a.blurb ||
        (tone === "ndp"
          ? zh
            ? "满额赠券 · 大奖倒计时"
            : "Spend & get · grand countdown"
          : tone === "draw"
            ? zh
              ? "购券抽大奖"
              : "Buy & enter grand draw"
            : zh
              ? "到店代金"
              : "Store credit"),
      href: a.href,
      entitlements,
      joined: Boolean(a.joined),
      summary: a.joined
        ? zh
          ? `已参与 · ${n} 项可看`
          : `Joined · ${n} items`
        : n > 0
          ? zh
            ? `${n} 项权益可参与`
            : `${n} perks to join`
          : zh
            ? "可参与"
            : "Join",
    };
  });
}
