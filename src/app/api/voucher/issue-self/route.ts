// POST /api/voucher/issue-self — 柜台发券（现金 / 无支付抵欠等）
// GET  /api/voucher/issue-self — 最近发券记录（审计）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allocateShortCode } from "@/lib/voucher-short-code";
import { isSelfUse } from "@/lib/product-kind";
import { calculateTierWeight, resolveTier } from "@/lib/draw-v2";
import {
  isIssueReasonId,
  isNoPayReason,
  paymentMethodForReason,
  reasonLabel,
  type IssueReasonId,
} from "@/lib/issue-self";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "仅企业主可查看发券记录" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const onlyNoPay = searchParams.get("noPay") === "1";
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take")) || 40));

    const stores = await prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const vouchers = await prisma.voucher.findMany({
      where: {
        productKind: "self_use",
        OR: [
          { storeId: { in: storeIds } },
          {
            campaign: { businessId: session.userId },
          },
        ],
        ...(onlyNoPay
          ? {
              issueReason: {
                in: [
                  "supplier_debt",
                  "staff_welfare",
                  "marketing",
                  "other_no_pay",
                ],
              },
            }
          : {
              OR: [
                { paymentMethod: { in: ["cash", "paynow_store"] } },
                { issueReason: { not: null } },
                { issuedById: { not: null } },
              ],
            }),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        shortCode: true,
        amountCents: true,
        paidCents: true,
        balanceCents: true,
        paymentMethod: true,
        issueReason: true,
        issueNote: true,
        issuedById: true,
        createdAt: true,
        store: { select: { name: true } },
        campaign: { select: { name: true, type: true } },
        customer: {
          select: { phone: true, displayName: true, email: true },
        },
      },
    });

    return NextResponse.json({
      data: vouchers.map((v) => ({
        id: v.id,
        shortCode: v.shortCode,
        faceSgd: (v.amountCents / 100).toFixed(2),
        paidSgd: (v.paidCents / 100).toFixed(2),
        balanceSgd: (v.balanceCents / 100).toFixed(2),
        paymentMethod: v.paymentMethod,
        issueReason: v.issueReason,
        issueReasonZh: reasonLabel(v.issueReason, "zh"),
        issueReasonEn: reasonLabel(v.issueReason, "en"),
        issueNote: v.issueNote,
        issuedById: v.issuedById,
        storeName: v.store?.name || null,
        campaignName: v.campaign?.name || null,
        isDraw:
          v.campaign?.type === "lucky_draw_v2" ||
          v.campaign?.type === "lucky_draw",
        customerPhone: v.customer?.phone || null,
        customerName: v.customer?.displayName || null,
        createdAt: v.createdAt.toISOString(),
        noPay: isNoPayReason(v.issueReason) || v.paidCents === 0,
      })),
    });
  } catch (e) {
    console.error("issue-self GET", e);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    // 发券（含现金）仅企业主；店员只做核销，避免乱发/抵欠
    if (!session || session.role !== "business") {
      return NextResponse.json(
        {
          error:
            session?.role === "staff"
              ? "店员不能发券，请使用企业主账号；店员请到「核销」扫码"
              : "未登录",
          code: session?.role === "staff" ? "BUSINESS_ONLY" : "UNAUTHORIZED",
        },
        { status: session ? 403 : 401 }
      );
    }

    const body = await request.json();
    const campaignId =
      typeof body.campaignId === "string" ? body.campaignId.trim() : "";

    const reasonRaw =
      typeof body.issueReason === "string" ? body.issueReason.trim() : "cash_sale";
    const issueReason: IssueReasonId = isIssueReasonId(reasonRaw)
      ? reasonRaw
      : "cash_sale";
    const noPay = isNoPayReason(issueReason);
    const issueNote =
      typeof body.issueNote === "string" ? body.issueNote.trim().slice(0, 500) : "";

    // Face F = spendable; paid P ≤ F
    const faceSgd = Number(body.faceSgd ?? body.amountSgd);
    const faceCents = Math.round(
      body.faceCents != null
        ? Number(body.faceCents)
        : body.amountCents != null
          ? Number(body.amountCents)
          : faceSgd * 100
    );

    let paidCents: number;
    if (noPay) {
      paidCents = 0;
    } else if (body.paidCents != null) {
      paidCents = Math.round(Number(body.paidCents));
    } else if (body.paidSgd != null) {
      paidCents = Math.round(Number(body.paidSgd) * 100);
    } else if (body.discountPercent != null) {
      const d = Math.min(90, Math.max(0, Number(body.discountPercent)));
      paidCents = Math.round((faceCents * (100 - d)) / 100);
    } else {
      paidCents = faceCents;
    }

    const customerPhone =
      typeof body.customerPhone === "string"
        ? body.customerPhone.trim()
        : "";
    const customerIdBody =
      typeof body.customerId === "string" ? body.customerId.trim() : "";
    const doInstantDraw = body.instantDraw !== false;

    const storeId =
      typeof body.storeId === "string" ? body.storeId.trim() : "";
    if (noPay) {
      if (issueNote.length < 4) {
        return NextResponse.json(
          {
            error:
              "无支付发券必须填写备注（供应商名、欠款单号、原因等，至少 4 字）",
          },
          { status: 400 }
        );
      }
      if (!customerPhone && !customerIdBody) {
        return NextResponse.json(
          {
            error: "无支付发券必须填写对方手机号，以便挂到账户",
          },
          { status: 400 }
        );
      }
    }

    if (!campaignId || !faceCents || faceCents < 100) {
      return NextResponse.json(
        { error: "请选择活动且面额至少 S$1" },
        { status: 400 }
      );
    }
    if (!noPay && (!Number.isFinite(paidCents) || paidCents < 1)) {
      return NextResponse.json({ error: "实收金额无效" }, { status: 400 });
    }
    if (paidCents > faceCents) {
      return NextResponse.json(
        { error: "实收不能大于面值" },
        { status: 400 }
      );
    }
    if (!storeId) {
      return NextResponse.json({ error: "请选择发售门店" }, { status: 400 });
    }

    const businessId = session.userId;

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId },
      select: { id: true, name: true },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不属于本企业" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: {
        id: true,
        productKind: true,
        status: true,
        type: true,
        name: true,
        instantPoolCents: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }
    if (!isSelfUse(campaign.productKind)) {
      return NextResponse.json(
        {
          error:
            "仅「先收款」活动可柜台发券（自用/独享）；共赢/分发请走线上支付",
        },
        { status: 400 }
      );
    }
    if (campaign.status === "ended" || campaign.status === "deleted") {
      return NextResponse.json({ error: "活动已结束" }, { status: 400 });
    }

    const isDraw =
      campaign.type === "lucky_draw_v2" || campaign.type === "lucky_draw";

    // 无支付不支持抽奖（避免 15% 扣费与「没收到钱」混账）
    if (noPay && isDraw) {
      return NextResponse.json(
        {
          error:
            "无支付发券仅支持自用代金，不支持独享抽奖。请选自用代金活动。",
        },
        { status: 400 }
      );
    }

    if (campaign.status === "draft") {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "active" },
      });
    }

    const faceSgdResolved = faceCents / 100;
    const tierResolved = resolveTier(faceSgdResolved);
    const tier = (tierResolved?.tier || "medium") as "small" | "medium" | "large";

    let customerId = customerIdBody;
    if (!customerId && customerPhone) {
      const phone = customerPhone.replace(/\s/g, "");
      let user = await prisma.user.findFirst({
        where: { phone, role: "customer" },
        select: { id: true },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            role: "customer",
            displayName: phone.slice(-4) ? `客户${phone.slice(-4)}` : "顾客",
          },
          select: { id: true },
        });
      }
      customerId = user.id;
    }
    if (!customerId) {
      // 现金销售可不绑手机（短码）；无支付已强制手机
      const walkIn = await prisma.user.create({
        data: {
          role: "customer",
          displayName: `到店${new Date().toISOString().slice(5, 16)}`,
          phone: null,
        },
        select: { id: true },
      });
      customerId = walkIn.id;
    }

    const weight = isDraw
      ? calculateTierWeight(faceCents, tier, faceCents, 0, 0)
      : 0;

    const shortCode = await allocateShortCode();
    const payMethod = paymentMethodForReason(issueReason);

    let voucher;
    let instantPrize: {
      name: string;
      icon: string;
      valueSgd: string;
    } | null = null;
    let feeNote = "";
    let balanceAfterCents = faceCents;

    try {
      const result = await prisma.$transaction(async (tx) => {
        let realPrize = true;
        let wFactor = 1;
        if (isDraw) {
          const { applyExclusiveCashSaleFees } = await import(
            "@/lib/exclusive-fees"
          );
          const { exclusiveConfigFromCampaign } = await import(
            "@/lib/templates"
          );
          const feeConfig = exclusiveConfigFromCampaign(campaign);
          try {
            const feeResult = await applyExclusiveCashSaleFees(tx, {
              businessId,
              campaignId: campaign.id,
              faceCents,
              feeConfig,
              referenceId: shortCode,
              label: `独享柜台发券 · ${campaign.name}`,
            });
            realPrize = feeResult.realPrizeFunding;
            wFactor = feeResult.weightFactor;
            const charged = feeResult.chargedCents ?? feeResult.totalCents;
            const pct = feeResult.totalPercent || 15;
            feeNote = realPrize
              ? `已扣自充 S$${(charged / 100).toFixed(2)}（${pct}%：小奖+服务费+大奖，已进池，小奖入余额）`
              : `已扣服务费 S$${(charged / 100).toFixed(2)}（2%）；未自充奖池：小奖请门店送、不注大奖池、权重×${wFactor}`;
          } catch (e) {
            if (e instanceof Error && e.message === "INSUFFICIENT_TOKEN") {
              throw new Error("INSUFFICIENT_TOKEN");
            }
            throw e;
          }
        }

        const startWeight =
          wFactor !== 1 && weight > 0
            ? Math.max(1, Math.round(weight * wFactor))
            : weight;

        const v = await tx.voucher.create({
          data: {
            customerId,
            campaignId: campaign.id,
            storeId: store.id,
            sellerId: null,
            amountCents: faceCents,
            paidCents,
            balanceCents: faceCents,
            usedCents: 0,
            prizePoolContribution: 0,
            drawWeight: startWeight,
            tier,
            status: "active",
            shortCode,
            productKind: "self_use",
            paymentMethod: payMethod,
            issueReason,
            issueNote: issueNote || null,
            issuedById: session.userId,
          },
        });

        let prize: typeof instantPrize = null;
        let balanceAfter = faceCents;
        if (isDraw && doInstantDraw && tierResolved) {
          const camp = await tx.campaign.findUnique({
            where: { id: campaign.id },
            select: { instantPoolCents: true },
          });
          const { awardInstantPrizeToVoucher } = await import(
            "@/lib/instant-prize"
          );
          const awarded = await awardInstantPrizeToVoucher(tx, {
            voucherId: v.id,
            campaignId: campaign.id,
            tier: tierResolved,
            weightAtTime: startWeight,
            instantPoolCents: camp?.instantPoolCents || 0,
            recomputeWeight: realPrize,
            creditToBalance: realPrize,
            weightFactor: realPrize ? 1 : wFactor,
          });
          prize = {
            name: awarded.prize.name,
            icon: awarded.prize.icon,
            valueSgd: (awarded.prize.valueCents / 100).toFixed(2),
          };
          balanceAfter = awarded.balanceAfterCents;
          await tx.campaign.update({
            where: { id: campaign.id },
            data: {
              entryCount: { increment: 1 },
              totalTicketCount: { increment: 1 },
            },
          });
        } else {
          await tx.campaign.update({
            where: { id: campaign.id },
            data: { totalClaims: { increment: 1 } },
          });
        }
        return { voucher: v, prize, balanceAfter };
      });
      voucher = result.voucher;
      instantPrize = result.prize;
      balanceAfterCents = result.balanceAfter;
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_TOKEN") {
        return NextResponse.json(
          {
            error:
              "账户不足以支付平台服务费（2%）。平台赠送额度仅可抵服务费；自充余额才可进奖池/抽小奖。有赠送额度即可开卖，不强制充值。",
            code: "NEED_TOPUP",
          },
          { status: 402 }
        );
      }
      throw e;
    }

    const discountPct =
      faceCents > 0
        ? Math.round(((faceCents - paidCents) / faceCents) * 1000) / 10
        : 0;

    const successNote = noPay
      ? `无支付发券（${reasonLabel(issueReason, "zh")}）已挂到对方账户 · 实收 S$0 · 可花 S$${(balanceAfterCents / 100).toFixed(2)}`
      : isDraw
        ? instantPrize
          ? feeNote.includes("门店兑")
            ? `独享已发出；小奖 ${instantPrize.name} 请门店兑付（未入余额）；可花 S$${(balanceAfterCents / 100).toFixed(2)}`
            : `独享已发出；小奖 ${instantPrize.name} 已加入可花余额（现 S$${(balanceAfterCents / 100).toFixed(2)}）`
          : "独享券已发出：顾客款在店；15% 已从企业账户计提"
        : "自用券已发出：实收已在店，可花面值进余额；核销仅记履约";

    return NextResponse.json({
      data: {
        id: voucher.id,
        shortCode: voucher.shortCode,
        balanceSgd: (balanceAfterCents / 100).toFixed(2),
        faceSgd: (faceCents / 100).toFixed(2),
        paidSgd: (paidCents / 100).toFixed(2),
        discountPercent: discountPct,
        productKind: "self_use",
        isDraw,
        displayKind: isDraw ? "exclusive" : "self_use",
        campaignName: campaign.name,
        storeName: store.name,
        paymentMethod: voucher.paymentMethod,
        issueReason,
        issueNote: issueNote || null,
        noPay,
        instantPrize,
        feeNote: feeNote || undefined,
        note: successNote,
      },
    });
  } catch (error) {
    console.error("issue-self error:", error);
    return NextResponse.json({ error: "发券失败" }, { status: 500 });
  }
}
