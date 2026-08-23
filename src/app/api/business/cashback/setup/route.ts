// GET  /api/business/cashback/setup — 读取活动 2 配置 + 成本预览基数
// POST /api/business/cashback/setup — 创建/更新活动 2（费率滑块 + 门店 opt-in）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeStoreIds } from "@/lib/utils";
import {
  parseCashbackRules,
  validateCashbackRates,
  monthToDateGmvCents,
  outstandingPlatformFeeCents,
  CASHBACK_INACTIVITY_MONTHS,
  TOTAL_PERCENT_MIN,
  TOTAL_PERCENT_MAX,
} from "@/lib/cashback";
import {
  marginalPlatformFeeDetailed,
  PLATFORM_MIN_MONTHLY_CENTS,
  gmvToReachMinimum,
} from "@/lib/platform-fee";
import { resolveActivePolicy } from "@/lib/platform-fee-policy";

const CASHBACK_SLUG_PREFIX = "cashback";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const businessId = session.userId;

    const [campaign, stores, mtdGmv, owed, policy] = await Promise.all([
      prisma.campaign.findFirst({
        where: { businessId, type: "cashback" },
        orderBy: { createdAt: "asc" },
      }),
      prisma.store.findMany({
        where: { businessId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      monthToDateGmvCents(prisma, businessId),
      outstandingPlatformFeeCents(prisma, businessId),
      resolveActivePolicy(prisma, session.userId),
    ]);

    const rules = parseCashbackRules(campaign?.rulesSnapshot ?? null);
    let selectedStoreIds: string[] | null = null;
    if (campaign?.storeIds) {
      try {
        const arr = JSON.parse(campaign.storeIds);
        if (Array.isArray(arr)) selectedStoreIds = arr;
      } catch {
        /* null = 全部门店 */
      }
    }

    return NextResponse.json({
      data: {
        campaign: campaign
          ? {
              id: campaign.id,
              name: campaign.name,
              status: campaign.status,
              startDate: campaign.startDate.toISOString(),
              endDate: campaign.endDate.toISOString(),
              transferPricingMode: campaign.transferPricingMode,
              cashbackIssuedCents: campaign.cashbackIssuedCents,
              cashbackRedeemedCents: campaign.cashbackRedeemedCents,
              outstandingCents: Math.max(
                0,
                campaign.cashbackIssuedCents - campaign.cashbackRedeemedCents
              ),
            }
          : null,
        rules,
        stores,
        selectedStoreIds,
        limits: {
          totalPercentMin: TOTAL_PERCENT_MIN,
          totalPercentMax: TOTAL_PERCENT_MAX,
          inactivityMonths: CASHBACK_INACTIVITY_MONTHS,
        },
        platform: {
          mtdGmvCents: mtdGmv,
          owedCents: owed,
          minMonthlyCents: PLATFORM_MIN_MONTHLY_CENTS,
          gmvToReachMinimumCents: gmvToReachMinimum(),
          policy: policy
            ? {
                kind: policy.kind,
                percentOverride: policy.percentOverride,
                waiveMinimum: policy.waiveMinimum,
                endsAt: policy.endsAt?.toISOString() ?? null,
                reason: policy.reason,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error("cashback setup GET error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const businessId = session.userId;
    const body = await request.json();

    const cashbackPercent = Number(body.cashbackPercent);
    const drawPercent = Number(body.drawPercent);
    if (!Number.isFinite(cashbackPercent) || !Number.isFinite(drawPercent)) {
      return NextResponse.json({ error: "费率无效" }, { status: 400 });
    }
    const check = validateCashbackRates(cashbackPercent, drawPercent);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const status = body.status === "active" ? "active" : "draft";
    const storeIdsInput: string[] | null = Array.isArray(body.storeIds)
      ? body.storeIds.filter((x: unknown) => typeof x === "string")
      : null;
    const transferPricingMode =
      body.transferPricingMode === "issuer_bears"
        ? "issuer_bears"
        : "redeemer_full";

    const rulesSnapshot = JSON.stringify({
      kind: "cashback",
      cashbackPercent,
      drawPercent,
      instantPoolRatio: 35,
      grandPoolRatio: 65,
      minSpendCents: Math.max(0, Math.round(Number(body.minSpendCents) || 0)),
      ticketsPerUnit: 1,
      // 大奖档位按它生成，必须稳定；默认 S$25
      avgTicketCents: Math.max(
        100,
        Math.round(Number(body.avgTicketCents) || 2_500)
      ),
      cashbackInactivityMonths: CASHBACK_INACTIVITY_MONTHS,
      snapshottedAt: new Date().toISOString(),
    });

    const existing = await prisma.campaign.findFirst({
      where: { businessId, type: "cashback" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const now = new Date();
    const end = new Date(now.getTime() + 365 * 86400_000);

    const campaign = existing
      ? await prisma.campaign.update({
          where: { id: existing.id },
          data: {
            status,
            rulesSnapshot,
            transferPricingMode,
            storeIds: storeIdsInput ? serializeStoreIds(storeIdsInput) : null,
            ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
          },
        })
      : await prisma.campaign.create({
          data: {
            businessId,
            name: typeof body.name === "string" && body.name.trim()
              ? body.name.trim()
              : "消费返 + 抽奖",
            description: "消费即返抵扣额度，并获得抽奖机会",
            type: "cashback",
            role: "activity",
            status,
            startDate: now,
            endDate: body.endDate ? new Date(body.endDate) : end,
            productKind: "self_use",
            rulesSnapshot,
            transferPricingMode,
            storeIds: storeIdsInput ? serializeStoreIds(storeIdsInput) : null,
            slug: `${CASHBACK_SLUG_PREFIX}-${businessId.slice(-8)}`,
            budgetPercent: 0,
            joinable: false,
            allowCollaboration: false,
          },
        });

    // 成本预览：按当月流水算下一笔 S$100 的边际平台费
    const mtdGmv = await monthToDateGmvCents(prisma, businessId);
    const preview = marginalPlatformFeeDetailed(mtdGmv, 10_000);

    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        status: campaign.status,
        rules: parseCashbackRules(campaign.rulesSnapshot),
        preview: {
          basisCents: 10_000,
          platformFeeCents: preview.feeCents,
          effectivePercent: Number(preview.effectivePercent.toFixed(3)),
          segments: preview.segments,
        },
      },
    });
  } catch (error) {
    console.error("cashback setup POST error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
