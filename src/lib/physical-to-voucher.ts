/**
 * 实体纸 → 线上自用券（统一资产）
 * 实体券 = 自用券打印版；绑定后钱包显示自用券，购买方式 physical
 */
import type { Prisma } from "@prisma/client";
import { resolveTier } from "@/lib/draw-v2";
import { generateShortCodeCandidate } from "@/lib/voucher-short-code";

type Tx = Prisma.TransactionClient;

export type MaterializeInput = {
  ticketId: string;
  customerId: string;
  /** 实收（分）；默认用纸上 paidCents 或面值 */
  paidCents?: number;
  soldStoreId?: string | null;
  /** 若纸尚未 sold，绑定/售出时一并写入 */
  markSold?: boolean;
  soldById?: string | null;
  contactPhone?: string | null;
};

/**
 * 将实体码落实为 Voucher(self_use, paymentMethod=physical)。
 * 幂等：已有 voucherId 则直接返回。
 */
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
  if (ticket.batch.type !== "voucher") throw new Error("NOT_VOUCHER_TYPE");

  if (ticket.voucherId) {
    const existing = await tx.voucher.findUnique({
      where: { id: ticket.voucherId },
    });
    if (existing) return { voucher: existing, created: false, ticket };
  }

  let campaignId = ticket.batch.campaignId;
  if (!campaignId) {
    // legacy 批次：自动挂/建一个自用活动
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
  const tier = resolveTier(faceSgd)?.tier || "small";

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

  const voucher = await tx.voucher.create({
    data: {
      customerId: input.customerId,
      campaignId,
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
      drawWeight: 0,
      tier,
      status: "active",
      productKind: "self_use",
      paymentMethod: paidCents === 0 ? "free" : "physical",
      shortCode,
    },
  });

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

  return { voucher, created: true, ticket: updatedTicket };
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
    // 若指定面额，尽量把档位扩进 rules
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
