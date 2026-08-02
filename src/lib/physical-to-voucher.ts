/**
 * 实体纸 → 线上权益
 * - type=voucher + 国庆活动 → CustomerCoupon（满赠券，与线上一致）
 * - type=voucher → 自用代金 Voucher
 * - type=draw + campaign self_use lucky_draw_v2 → 独享抽奖 Voucher
 */
import type { Prisma } from "@prisma/client";
import { calculateTierWeight, resolveTier } from "@/lib/draw-v2";
import { awardInstantPrizeToVoucher } from "@/lib/instant-prize";
import { generateShortCodeCandidate } from "@/lib/voucher-short-code";
import { generateQrCode } from "@/lib/utils";
import {
  computeNdpExpiresAt,
  ensureNdpGiftCoupon,
  NDP_GIFT_COUPON_CENTS,
  NDP_VALID_DAYS,
  parseNdpMetaFromCampaign,
} from "@/lib/ndp-promo";

type Tx = Prisma.TransactionClient;

/** 是否国庆满赠类活动（实体应绑成赠送券） */
export function isNdpGiftCampaign(camp: {
  type?: string | null;
  name?: string | null;
  tags?: string | null;
  rulesSnapshot?: string | null;
}): boolean {
  if (camp.type === "holiday") return true;
  if (camp.name && /国庆|ndp|national\s*day/i.test(camp.name)) return true;
  if (camp.tags && /ndp|国庆|national|category:ndp/i.test(camp.tags))
    return true;
  try {
    if (camp.rulesSnapshot && /"ndp"\s*:/.test(camp.rulesSnapshot)) {
      const o = JSON.parse(camp.rulesSnapshot) as { ndp?: { enabled?: boolean } };
      if (o.ndp && o.ndp.enabled !== false) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 国庆实体纸 → 线上满赠 CustomerCoupon（与前台发放规则一致：领后 N 天有效）
 */
export async function materializePhysicalToNdpGift(
  tx: Tx,
  input: { ticketId: string; customerId: string }
) {
  const ticket = await tx.physicalTicket.findUnique({
    where: { id: input.ticketId },
    include: {
      batch: {
        select: {
          id: true,
          type: true,
          title: true,
          valueCents: true,
          campaignId: true,
          couponId: true,
          businessId: true,
          status: true,
          validUntil: true,
        },
      },
    },
  });

  if (!ticket) throw new Error("TICKET_NOT_FOUND");
  if (ticket.batch.status === "void") throw new Error("BATCH_VOID");
  if (ticket.status === "redeemed") throw new Error("ALREADY_REDEEMED");
  if (ticket.status === "void") throw new Error("TICKET_VOID");
  if (ticket.batch.type !== "voucher") throw new Error("UNSUPPORTED_TYPE");

  // 已绑赠送券
  if (ticket.customerCouponId) {
    const existing = await tx.customerCoupon.findUnique({
      where: { id: ticket.customerCouponId },
    });
    if (existing) {
      return {
        kind: "ndp_gift" as const,
        customerCoupon: existing,
        voucher: null,
        created: false,
        ticket,
        instantPrize: null,
      };
    }
  }

  // 误绑成 Voucher 的旧数据：不重复建
  if (ticket.voucherId) {
    const existing = await tx.voucher.findUnique({
      where: { id: ticket.voucherId },
    });
    if (existing) {
      return {
        kind: "voucher" as const,
        customerCoupon: null,
        voucher: existing,
        created: false,
        ticket,
        instantPrize: null,
      };
    }
  }

  const campaignId = ticket.batch.campaignId;
  if (!campaignId) throw new Error("NDP_CAMPAIGN_REQUIRED");

  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      type: true,
      name: true,
      tags: true,
      rulesSnapshot: true,
      status: true,
      startDate: true,
      endDate: true,
      businessId: true,
    },
  });
  if (!campaign || campaign.businessId !== ticket.batch.businessId) {
    throw new Error("NDP_CAMPAIGN_REQUIRED");
  }
  if (!isNdpGiftCampaign(campaign)) throw new Error("NDP_CAMPAIGN_REQUIRED");

  const customer = await tx.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, role: true },
  });
  if (!customer || customer.role !== "customer") {
    throw new Error("CUSTOMER_REQUIRED");
  }

  const meta = parseNdpMetaFromCampaign(campaign);
  const giftCents =
    ticket.batch.valueCents > 0
      ? ticket.batch.valueCents
      : meta.giftCouponCents || NDP_GIFT_COUPON_CENTS;

  const issuedAt = new Date();
  const validity = computeNdpExpiresAt({
    obtainedAt: issuedAt,
    validDays: meta.validDays || NDP_VALID_DAYS,
    activityEnd: campaign.endDate,
    dualProtection: meta.dualProtection,
  });
  const expiresAt = validity.expiresAt;
  // 批次有效期若更早，取较早者
  let finalExpiry = expiresAt;
  if (
    ticket.batch.validUntil &&
    ticket.batch.validUntil.getTime() < finalExpiry.getTime()
  ) {
    finalExpiry = ticket.batch.validUntil;
  }

  const templateUntil = new Date(finalExpiry.getTime());
  templateUntil.setDate(templateUntil.getDate() + 365);

  const coupon = await ensureNdpGiftCoupon(tx, {
    businessId: ticket.batch.businessId,
    campaignId: campaign.id,
    giftCouponCents: giftCents,
    templateValidUntil: templateUntil,
  });

  // 若批次未挂 couponId，补上
  if (ticket.batch.couponId !== coupon.id) {
    await tx.physicalBatch.update({
      where: { id: ticket.batch.id },
      data: { couponId: coupon.id, campaignId: campaign.id },
    });
  }

  const qrCode = generateQrCode();
  const claim = await tx.customerCoupon.create({
    data: {
      customerId: customer.id,
      couponId: coupon.id,
      status: "available",
      qrCode,
      claimedAt: issuedAt,
      expiresAt: finalExpiry,
      pointsSpent: 0,
    },
  });

  await tx.coupon.update({
    where: { id: coupon.id },
    data: {
      claimedCount: { increment: 1 },
      ...(coupon.remainingQuantity !== null
        ? { remainingQuantity: { decrement: 1 } }
        : {}),
    },
  });

  await tx.membership.upsert({
    where: {
      businessId_customerId: {
        businessId: ticket.batch.businessId,
        customerId: customer.id,
      },
    },
    create: {
      businessId: ticket.batch.businessId,
      customerId: customer.id,
      points: 0,
    },
    update: {},
  });

  // 审计：幂等 fingerprint
  const fingerprint = `physical|${ticket.id}`;
  const dupGrant = await tx.promoGrant.findFirst({
    where: { receiptFingerprint: fingerprint },
    select: { id: true },
  });
  if (!dupGrant) {
    await tx.promoGrant.create({
      data: {
        businessId: ticket.batch.businessId,
        campaignId: campaign.id,
        storeId: ticket.storeId,
        customerId: customer.id,
        phone: `id:${customer.id.slice(-8)}`,
        receiptAmountCents: 0,
        receiptFingerprint: fingerprint,
        status: "claimed",
        channel: "physical",
        customerCouponId: claim.id,
        issuedAt,
        expiresAt: finalExpiry,
      },
    });
  }

  const updatedTicket = await tx.physicalTicket.update({
    where: { id: ticket.id },
    data: {
      customerId: customer.id,
      customerCouponId: claim.id,
      status: "claimed",
      claimedAt: issuedAt,
      paidCents: 0,
      paymentMethod: "free",
      soldAt: ticket.soldAt || issuedAt,
      soldStoreId: ticket.soldStoreId || ticket.storeId,
    },
  });

  return {
    kind: "ndp_gift" as const,
    customerCoupon: claim,
    voucher: null,
    created: true,
    ticket: updatedTicket,
    instantPrize: null,
    giftCents,
    expiresAt: finalExpiry,
  };
}

export type MaterializeInput = {
  ticketId: string;
  customerId: string;
  paidCents?: number;
  soldStoreId?: string | null;
  markSold?: boolean;
  soldById?: string | null;
  contactPhone?: string | null;
  /** 独享绑定后是否即时抽小奖，默认 true */
  instantDraw?: boolean;
  /** 真钱路径：小奖进余额；gift 路径：false 门店兑 */
  creditPrizeToBalance?: boolean;
  /** gift 路径权重系数，默认 1 */
  weightFactor?: number;
};

export async function materializePhysicalToVoucher(
  tx: Tx,
  input: MaterializeInput
) {
  const ticket = await tx.physicalTicket.findUnique({
    where: { id: input.ticketId },
    include: {
      batch: {
        select: {
          id: true,
          type: true,
          title: true,
          valueCents: true,
          campaignId: true,
          businessId: true,
          status: true,
          validUntil: true,
        },
      },
    },
  });

  if (!ticket) throw new Error("TICKET_NOT_FOUND");
  if (ticket.batch.status === "void") throw new Error("BATCH_VOID");
  if (ticket.status === "redeemed") throw new Error("ALREADY_REDEEMED");
  if (ticket.status === "void") throw new Error("TICKET_VOID");

  const batchType = ticket.batch.type;
  if (batchType !== "voucher" && batchType !== "draw") {
    throw new Error("UNSUPPORTED_TYPE");
  }

  if (ticket.voucherId) {
    const existing = await tx.voucher.findUnique({
      where: { id: ticket.voucherId },
      include: { draws: { where: { drawType: "instant" }, take: 1 } },
    });
    if (existing) {
      return {
        voucher: existing,
        created: false,
        ticket,
        instantPrize: existing.draws[0]
          ? {
              name: existing.draws[0].prizeName || "",
              icon: existing.draws[0].prizeIcon || "🎁",
              valueSgd: ((existing.draws[0].valueCents || 0) / 100).toFixed(2),
            }
          : null,
      };
    }
  }

  let campaignId = ticket.batch.campaignId;
  let campaign = campaignId
    ? await tx.campaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          type: true,
          productKind: true,
          status: true,
          instantPoolCents: true,
          businessId: true,
        },
      })
    : null;

  if (batchType === "draw") {
    if (!campaign || campaign.productKind !== "self_use") {
      throw new Error("EXCLUSIVE_CAMPAIGN_REQUIRED");
    }
    if (
      campaign.type !== "lucky_draw_v2" &&
      campaign.type !== "lucky_draw"
    ) {
      throw new Error("DRAW_CAMPAIGN_REQUIRED");
    }
  }

  if (!campaignId || !campaign) {
    // 仅代金可自动建自用活动
    if (batchType !== "voucher") throw new Error("CAMPAIGN_REQUIRED");
    const existingCamp = await tx.campaign.findFirst({
      where: {
        businessId: ticket.batch.businessId,
        productKind: "self_use",
        type: "voucher_sale",
        status: { in: ["active", "draft"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingCamp) {
      campaignId = existingCamp.id;
      campaign = {
        id: existingCamp.id,
        type: "voucher_sale",
        productKind: "self_use",
        status: existingCamp.status,
        instantPoolCents: 0,
        businessId: ticket.batch.businessId,
      };
    } else {
      const start = new Date();
      const end = new Date();
      end.setFullYear(end.getFullYear() + 2);
      const camp = await tx.campaign.create({
        data: {
          businessId: ticket.batch.businessId,
          name: "自用券（实体/线上）",
          description: "实体印刷与线上自用统一活动",
          type: "voucher_sale",
          productKind: "self_use",
          status: "active",
          startDate: start,
          endDate: end,
          budgetPercent: 0,
          templateId: "voucher_discount",
          rulesSnapshot: JSON.stringify({
            kind: "voucher",
            templateId: "voucher_discount",
            campaignType: "voucher_sale",
            allowDiscount: true,
            discountPercent: 0,
            sellerCommissionPercent: 0,
            platformFeePercent: 0,
            prizePoolPercent: 0,
            shareSellingEnabled: false,
            enabledTiers: [10, 20, 50, 100],
          }),
          tags: JSON.stringify(["self_use", "physical_unified"]),
        },
      });
      campaignId = camp.id;
      campaign = {
        id: camp.id,
        type: "voucher_sale",
        productKind: "self_use",
        status: "active",
        instantPoolCents: 0,
        businessId: ticket.batch.businessId,
      };
    }
    await tx.physicalBatch.update({
      where: { id: ticket.batch.id },
      data: { campaignId },
    });
  }

  const faceCents = Math.max(0, ticket.batch.valueCents);
  if (faceCents < 100) throw new Error("INVALID_FACE");

  const paidCents = Math.max(
    0,
    Math.round(
      input.paidCents != null
        ? input.paidCents
        : ticket.paidCents > 0
          ? ticket.paidCents
          : faceCents
    )
  );

  const faceSgd = faceCents / 100;
  const tierResolved = resolveTier(faceSgd);
  const tier = tierResolved?.tier || "small";
  const isDraw = batchType === "draw";
  const creditPrize = input.creditPrizeToBalance !== false;
  const wFactor =
    input.weightFactor != null && input.weightFactor > 0
      ? input.weightFactor
      : 1;
  let weight = isDraw
    ? calculateTierWeight(faceCents, tier as "small" | "medium" | "large", faceCents, 0, 0)
    : 0;
  if (isDraw && wFactor !== 1 && weight > 0) {
    weight = Math.max(1, Math.round(weight * wFactor));
  }

  let shortCode: string | null = null;
  for (let i = 0; i < 12 && !shortCode; i++) {
    const cand = generateShortCodeCandidate();
    const hit = await tx.voucher.findUnique({
      where: { shortCode: cand },
      select: { id: true },
    });
    if (!hit) shortCode = cand;
  }
  if (!shortCode) throw new Error("SHORT_CODE_FAILED");

  const soldStoreId =
    input.soldStoreId || ticket.soldStoreId || ticket.storeId;

  let voucher = await tx.voucher.create({
    data: {
      customerId: input.customerId,
      campaignId: campaignId!,
      storeId: soldStoreId,
      amountCents: faceCents,
      paidCents,
      sellerCommissionCents: 0,
      platformFeeCents: 0,
      usedCents: 0,
      balanceCents: faceCents,
      withdrawnCents: 0,
      instantPrizeClawedCents: 0,
      prizePoolContribution: 0,
      drawWeight: weight,
      tier,
      status: "active",
      productKind: "self_use",
      paymentMethod: paidCents === 0 ? "free" : "physical",
      shortCode,
    },
  });

  let instantPrize: {
    name: string;
    icon: string;
    valueSgd: string;
  } | null = null;

  if (isDraw && input.instantDraw !== false && tierResolved) {
    const camp = await tx.campaign.findUnique({
      where: { id: campaignId! },
      select: { instantPoolCents: true },
    });
    const awarded = await awardInstantPrizeToVoucher(tx, {
      voucherId: voucher.id,
      campaignId: campaignId!,
      tier: tierResolved,
      weightAtTime: weight,
      instantPoolCents: camp?.instantPoolCents || 0,
      recomputeWeight: creditPrize,
      creditToBalance: creditPrize,
      weightFactor: creditPrize ? 1 : wFactor,
    });
    instantPrize = {
      name: awarded.prize.name,
      icon: awarded.prize.icon,
      valueSgd: (awarded.prize.valueCents / 100).toFixed(2),
    };
    // refresh voucher balance after prize credit
    voucher = await tx.voucher.findUniqueOrThrow({
      where: { id: voucher.id },
    });
    await tx.campaign.update({
      where: { id: campaignId! },
      data: {
        entryCount: { increment: 1 },
        totalTicketCount: { increment: 1 },
      },
    });
  }

  const now = new Date();
  const updatedTicket = await tx.physicalTicket.update({
    where: { id: ticket.id },
    data: {
      voucherId: voucher.id,
      customerId: input.customerId,
      status: "claimed",
      claimedAt: now,
      contactPhone: input.contactPhone ?? ticket.contactPhone,
      paidCents,
      paymentMethod:
        paidCents === 0 ? "free" : ticket.paymentMethod || "physical",
      ...(input.markSold || !ticket.soldAt
        ? {
            soldAt: ticket.soldAt || now,
            soldById: ticket.soldById || input.soldById || null,
            soldStoreId,
          }
        : {}),
    },
  });

  return {
    voucher,
    created: true,
    ticket: updatedTicket,
    instantPrize,
  };
}

/** 确保业务有可挂载的自用代金活动；返回 campaignId */
export async function ensureSelfUseCampaignForPrint(
  tx: Tx,
  businessId: string,
  opts?: { name?: string; discountPercent?: number; faceSgd?: number }
): Promise<string> {
  const face = opts?.faceSgd && opts.faceSgd > 0 ? Math.round(opts.faceSgd) : null;
  const existing = await tx.campaign.findFirst({
    where: {
      businessId,
      productKind: "self_use",
      type: "voucher_sale",
      status: { in: ["active", "draft"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (face && existing.rulesSnapshot) {
      try {
        const snap = JSON.parse(existing.rulesSnapshot) as {
          enabledTiers?: number[];
        };
        const tiers = new Set(snap.enabledTiers || []);
        if (!tiers.has(face)) {
          tiers.add(face);
          snap.enabledTiers = Array.from(tiers).sort((a, b) => a - b);
          await tx.campaign.update({
            where: { id: existing.id },
            data: { rulesSnapshot: JSON.stringify(snap) },
          });
        }
      } catch {
        /* ignore */
      }
    }
    return existing.id;
  }

  const start = new Date();
  const end = new Date();
  end.setFullYear(end.getFullYear() + 2);
  const discountPercent = Math.min(
    30,
    Math.max(0, Math.round(opts?.discountPercent ?? 0))
  );
  const tiers = face ? [10, 20, 50, 100, face] : [10, 20, 50, 100];
  const uniqueTiers = Array.from(new Set(tiers)).sort((a, b) => a - b);

  const camp = await tx.campaign.create({
    data: {
      businessId,
      name: opts?.name || "自用券（实体/线上）",
      description:
        "统一自用券：线上购买与实体印刷同一套；实体为打印版。",
      type: "voucher_sale",
      productKind: "self_use",
      status: "active",
      startDate: start,
      endDate: end,
      budgetPercent: 0,
      templateId: "voucher_discount",
      rulesSnapshot: JSON.stringify({
        kind: "voucher",
        templateId: "voucher_discount",
        campaignType: "voucher_sale",
        allowDiscount: discountPercent > 0,
        discountPercent,
        sellerCommissionPercent: 0,
        platformFeePercent: 0,
        prizePoolPercent: 0,
        shareSellingEnabled: false,
        enabledTiers: uniqueTiers,
      }),
      tags: JSON.stringify(["self_use", "physical_unified"]),
    },
  });
  return camp.id;
}
