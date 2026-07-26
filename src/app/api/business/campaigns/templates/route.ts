import { NextResponse } from "next/server";
import { getPrizePack, listTemplates } from "@/lib/templates";

/** GET /api/business/campaigns/templates — platform template catalog */
export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "admin")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const data = listTemplates().map((t) => {
    const pack = getPrizePack(t.rules.prizePackId);
    return {
      id: t.id,
      nameZh: t.nameZh,
      nameEn: t.nameEn,
      icon: t.icon,
      taglineZh: t.taglineZh,
      taglineEn: t.taglineEn,
      baseTemplateId: t.baseTemplateId ?? null,
      editable: t.editable,
      rules: {
        kind: t.rules.kind,
        allowDiscount: t.rules.allowDiscount,
        discountPercentDefault: t.rules.discountPercentDefault,
        discountPercentMin: t.rules.discountPercentMin,
        discountPercentMax: t.rules.discountPercentMax,
        sellerCommissionPercent: t.rules.sellerCommissionPercent,
        platformFeePercent: t.rules.platformFeePercent,
        prizePoolPercent: t.rules.prizePoolPercent,
        shareSellingDefault: t.rules.shareSellingDefault,
        campaignType: t.rules.campaignType,
        tiers: t.rules.tiers,
        prizePackId: t.rules.prizePackId,
        exclusiveFeeTotalPercent: t.rules.exclusiveFeeTotalPercent,
        defaultProductKind: t.rules.defaultProductKind,
      },
      prizePack: pack
        ? {
            id: pack.id,
            nameZh: pack.nameZh,
            drawStyle: pack.mechanics.drawStyle,
            /** Defaults store can edit (name / icon / target); algorithm locked */
            grandPrizes: pack.grandPrizes.map((g) => ({
              id: g.id,
              name: g.nameZh,
              nameZh: g.nameZh,
              icon: g.icon,
              targetCents: g.targetCents,
              targetSgd: g.targetCents / 100,
              valueCents: g.valueCents,
              requiresEscrow: g.requiresEscrow,
            })),
          }
        : null,
      lockedSummaryZh: buildLockedSummaryZh(t, pack),
    };
  });

  return NextResponse.json({ data });
}

function buildLockedSummaryZh(
  t: ReturnType<typeof listTemplates>[number],
  pack: ReturnType<typeof getPrizePack>
): string {
  const parts: string[] = [];
  if (t.rules.defaultProductKind === "self_use") {
    parts.push("自用·集团内");
  }
  if (t.rules.exclusiveFeeTotalPercent) {
    const fee = t.rules.exclusiveFeeTotalPercent;
    parts.push(
      fee === 10
        ? "付款扣 10%（小奖3+服务费2+大奖5）"
        : "付款扣 15%（小奖3+服务费2+大奖10）"
    );
    parts.push("公司仅可同时激活一个独享");
    parts.push("需门店选用后才可售");
  } else if (t.rules.sellerCommissionPercent > 0) {
    parts.push(`卖家佣金 ${t.rules.sellerCommissionPercent}%（按实付）`);
  }
  if (t.rules.prizePoolPercent > 0) {
    parts.push(`奖池 ${t.rules.prizePoolPercent}%（按实付）`);
  } else if (!t.rules.exclusiveFeeTotalPercent) {
    parts.push("无购券时奖池扣点");
  }
  if (t.rules.allowDiscount) {
    parts.push(
      `折扣可调 ${t.rules.discountPercentMin}–${t.rules.discountPercentMax}%（默认 ${t.rules.discountPercentDefault}%）`
    );
  } else if (!t.rules.exclusiveFeeTotalPercent) {
    parts.push("不打折（原价）");
  }
  if (pack?.mechanics.drawStyle === "instant_plus_deferred_grand") {
    parts.push("即时小奖 + 延迟大奖");
    const grands = pack.grandPrizes.map((g) => g.nameZh).join("/");
    if (grands) parts.push(`默认奖：${grands}`);
  }
  if (t.rules.shareSellingDefault || t.id === "share_boost") {
    parts.push("支持分享卖货");
  }
  if (
    t.rules.platformFeePercent > 0 &&
    !t.rules.exclusiveFeeTotalPercent
  ) {
    parts.push(`平台 ${t.rules.platformFeePercent}%`);
  }
  const tiers = t.rules.tiers
    .filter((x) => x.enabledByDefault)
    .map((x) => `S$${x.amountSgd}`)
    .join("/");
  if (tiers) parts.push(`默认档 ${tiers}`);
  return parts.join(" · ");
}
