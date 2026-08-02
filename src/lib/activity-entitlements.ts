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

/**
 * 顾客持仓里抽奖行的跳转：区分国庆落地页 vs 独享大奖倒计时。
 */
export function resolveCustomerDrawLinks(input: {
  campaignId: string;
  campaignSlug?: string | null;
  campaignType?: string | null;
  campaignName?: string | null;
  campaignTags?: string | null;
  rulesSnapshot?: string | null;
  /** 国庆 rules 里的 buyVoucherSlug；也可调用方直接传入 */
  buyVoucherSlug?: string | null;
}): { activityHref: string; countdownHref: string } {
  const slug = input.campaignSlug?.trim() || null;
  const isNdp =
    input.campaignType === "holiday" ||
    /国庆|ndp|national\s*day/i.test(input.campaignName || "") ||
    (input.campaignTags
      ? /ndp|国庆|national|category:ndp/i.test(input.campaignTags)
      : false);

  let buySlug = input.buyVoucherSlug?.trim() || null;
  if (!buySlug && input.rulesSnapshot) {
    try {
      const raw = JSON.parse(input.rulesSnapshot) as Record<string, unknown>;
      const ndp =
        raw.ndp && typeof raw.ndp === "object"
          ? (raw.ndp as Record<string, unknown>)
          : null;
      if (ndp && typeof ndp.buyVoucherSlug === "string") {
        buySlug = ndp.buyVoucherSlug.trim() || null;
      }
    } catch {
      /* ignore */
    }
  }

  const activityHref =
    slug && isNdp
      ? `/ndp/${encodeURIComponent(slug)}`
      : slug
        ? `/voucher/${encodeURIComponent(slug)}`
        : `/activity/${encodeURIComponent(input.campaignId)}`;

  // 国庆赠送签权重挂在满赠活动上，倒计时看关联的大奖（独享）活动
  // view=draw：落地为抽奖台优先（非买券主叙事）；hash 兼容旧链
  const countdownHref =
    isNdp && buySlug
      ? `/voucher/${encodeURIComponent(buySlug)}?view=draw#grand-countdown`
      : isNdp
        ? activityHref
        : slug
          ? `/voucher/${encodeURIComponent(slug)}?view=draw#grand-countdown`
          : activityHref;

  return { activityHref, countdownHref };
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
    campaignSlug?: string | null;
    campaignType?: string | null;
    businessName: string | null;
    drawWeight: number;
    shortCode: string | null;
    isGiftEntry: boolean;
    balanceCents: number;
    amountCents: number;
    /**
     * 活动详情页：
     * - 国庆 holiday → /ndp/{slug}
     * - 抽奖/独享 → /voucher/{slug}
     */
    activityHref?: string | null;
    /**
     * 大奖倒计时：
     * - 独享抽奖 → /voucher/{slug}?view=draw#grand-countdown
     * - 国庆赠送签 → 关联 buyVoucherSlug 的大奖活动（勿链 /voucher/ndp-slug）
     */
    countdownHref?: string | null;
    /** 预付余额行跳转，默认 /balance */
    balanceHref?: string | null;
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
    } else {
      // 后写入的活动页链接可补全
      const g = map.get(key)!;
      if (!g.href && partial.href) g.href = partial.href;
      if (!g.blurb && partial.blurb) g.blurb = partial.blurb;
    }
    return map.get(key)!;
  };

  const activityOf = (d: {
    campaignSlug?: string | null;
    campaignId: string;
    campaignType?: string | null;
    campaignName?: string | null;
    activityHref?: string | null;
  }) => {
    if (d.activityHref) return d.activityHref;
    const slug = d.campaignSlug?.trim();
    const isNdp =
      d.campaignType === "holiday" ||
      /国庆|ndp|national\s*day/i.test(d.campaignName || "");
    if (slug && isNdp) {
      return `/ndp/${encodeURIComponent(slug)}`;
    }
    if (slug) {
      return `/voucher/${encodeURIComponent(slug)}`;
    }
    if (d.campaignId) {
      return `/activity/${encodeURIComponent(d.campaignId)}`;
    }
    return "/discover/draws";
  };

  const countdownOf = (d: {
    campaignSlug?: string | null;
    campaignId: string;
    campaignType?: string | null;
    campaignName?: string | null;
    activityHref?: string | null;
    countdownHref?: string | null;
  }) => {
    // 国庆满赠签：调用方应传入关联大奖 slug 的 countdownHref
    if (d.countdownHref) return d.countdownHref;
    const slug = d.campaignSlug?.trim();
    const isNdp =
      d.campaignType === "holiday" ||
      /国庆|ndp|national\s*day/i.test(d.campaignName || "");
    // 国庆活动本身不是 lucky_draw 页：无关联时回活动详情，勿打开 /voucher/ndp-*
    if (isNdp) {
      return activityOf(d);
    }
    if (slug) {
      return `/voucher/${encodeURIComponent(slug)}?view=draw#grand-countdown`;
    }
    return activityOf(d);
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
    const activityHref = activityOf(d);
    const countdownHref = countdownOf(d);
    const tone = activityToneFromType(
      d.campaignType || (d.isGiftEntry ? "holiday" : "lucky_draw_v2"),
      d.campaignName
    );
    const g = ensure(key, {
      campaignId: d.campaignId,
      title: d.campaignName || (zh ? "大奖活动" : "Grand draw"),
      businessName: d.businessName,
      type: d.campaignType || "lucky_draw_v2",
      tone: tone === "default" ? (d.isGiftEntry ? "ndp" : "draw") : tone,
      blurb: d.isGiftEntry
        ? zh
          ? "赠送抽奖 · 购券可获约 5 倍机会"
          : "Gift draw · buy for ~5× chance"
        : zh
          ? "购券 · 大奖资格"
          : "Paid · Grand draw",
      // 活动详情：国庆落地页 / 购券活动页（不是错误的 /voucher/ndp）
      href: activityHref,
    });
    // 同一张券：可花余额 + 抽奖资格 拆成两行（首页/券包一致）
    if (d.balanceCents > 0) {
      g.entitlements.push({
        id: `${d.id}-bal`,
        kind: "prepaid",
        tone: "prepaid",
        title: zh ? "预付余额" : "Prepaid balance",
        primaryLabel: `S$${(d.balanceCents / 100).toFixed(2)}`,
        secondaryLabel: zh
          ? `面值 S$${(d.amountCents / 100).toFixed(0)} · 到店核销`
          : `Face S$${(d.amountCents / 100).toFixed(0)} · redeem in store`,
        href: d.balanceHref ?? "/balance",
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
      // 与首页一致：都显示「1 次机会」，不暴露内部权重数字
      primaryLabel: zh ? "1 次机会" : "1 chance",
      secondaryLabel: d.shortCode
        ? `${zh ? "短码" : "Code"} ${d.shortCode}`
        : d.isGiftEntry
          ? zh
            ? "购券可获约 5 倍机会"
            : "~5× if you buy"
          : zh
            ? "点进看大奖倒计时"
            : "Tap for prize countdown",
      href: countdownHref,
      ops: [
        {
          label: zh ? "看倒计时" : "Countdown",
          labelEn: "Countdown",
          href: countdownHref,
        },
      ],
    });
  }

  for (const p of input.prepaid || []) {
    const key = p.campaignId || `solo-prepaid-${p.id}`;
    const g = ensure(key, {
      campaignId: p.campaignId,
      title: p.campaignName || (zh ? "预付活动" : "Prepaid"),
      businessName: p.businessName,
      type: "voucher_sale",
      tone: "voucher",
      blurb: zh ? "到店可花余额" : "Spend in-store",
      href: p.href ?? "/balance",
    });
    if (!g.entitlements.some((e) => e.id === p.id || e.id === `${p.id}-bal`)) {
      g.entitlements.push({
        id: p.id,
        kind: "prepaid",
        tone: "prepaid",
        title: zh ? "预付余额" : "Prepaid balance",
        primaryLabel: `S$${(p.balanceCents / 100).toFixed(2)}`,
        secondaryLabel: zh
          ? `面值 S$${(p.amountCents / 100).toFixed(0)} · 到店核销`
          : `Face S$${(p.amountCents / 100).toFixed(0)} · redeem in store`,
        href: p.href ?? "/balance",
      });
    }
  }

  for (const g of map.values()) {
    const n = g.entitlements.length;
    const gifts = g.entitlements.filter((e) => e.kind === "gift_coupon").length;
    const draws = g.entitlements.filter((e) => e.kind === "draw_entry").length;
    const prepaid = g.entitlements.filter((e) => e.kind === "prepaid").length;
    const bits: string[] = [];
    if (gifts) bits.push(zh ? `${gifts} 赠券` : `${gifts} gift`);
    if (draws) bits.push(zh ? `${draws} 抽奖` : `${draws} draw`);
    if (prepaid) bits.push(zh ? `${prepaid} 余额` : `${prepaid} balance`);
    g.summary =
      bits.length > 0
        ? `${zh ? `${n} 项权益` : `${n} perk${n === 1 ? "" : "s"}`} · ${bits.join(" · ")}`
        : zh
          ? `${n} 项权益`
          : `${n} perk${n === 1 ? "" : "s"}`;
    g.summaryEn = g.summary;
  }

  return Array.from(map.values()).sort((a, b) => {
    const score = (x: ActivityBundle) =>
      (x.tone === "ndp" ? 20 : 0) +
      (x.tone === "draw" ? 12 : 0) +
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
