// POST /api/business/cashback/issue-token — 店员收银时出码
// GET  /api/business/cashback/issue-token — 本店今日出码记录
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storeIdsAllows } from "@/lib/utils";
import {
  allocateClaimToken,
  claimTokenExpiry,
  claimTokenPath,
  CLAIM_TOKEN_TTL_MINUTES,
} from "@/lib/cashback-token";
import { parseCashbackRules, SINGLE_SPEND_CONFIRM_CENTS } from "@/lib/cashback";
import { generateQrCodeSvg } from "@/lib/qr";
import { publicOrigin } from "@/lib/request-origin";

/** 解析操作人所属品牌与门店（店员用 session 店，企业主可传 storeId） */
async function resolveActor(
  session: { userId: string; role: string; storeId?: string },
  bodyStoreId?: string | null
): Promise<{ businessId: string; storeId: string } | { error: string; status: number }> {
  if (session.role === "staff") {
    if (!session.storeId) return { error: "店员未绑定门店", status: 403 };
    const store = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { id: true, businessId: true },
    });
    if (!store) return { error: "门店不存在", status: 404 };
    return { businessId: store.businessId, storeId: store.id };
  }
  if (session.role !== "business") return { error: "无权限", status: 403 };

  const storeId = bodyStoreId?.trim();
  if (!storeId) return { error: "请选择门店", status: 400 };
  const store = await prisma.store.findFirst({
    where: { id: storeId, businessId: session.userId },
    select: { id: true },
  });
  if (!store) return { error: "门店不存在", status: 404 };
  return { businessId: session.userId, storeId: store.id };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const actor = await resolveActor(session, body.storeId);
    if ("error" in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const amountCents = Math.round(Number(body.amountCents));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "消费金额无效" }, { status: 400 });
    }
    // 大额需企业主操作（店员出不了）
    if (amountCents > SINGLE_SPEND_CONFIRM_CENTS && session.role === "staff") {
      return NextResponse.json(
        { error: `单笔超过 S$${(SINGLE_SPEND_CONFIRM_CENTS / 100).toFixed(0)}，请企业主操作` },
        { status: 403 }
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { businessId: actor.businessId, type: "cashback", status: "active" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        rulesSnapshot: true,
        storeIds: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { error: "未启用「消费返 + 抽奖」活动" },
        { status: 400 }
      );
    }
    const now = new Date();
    if (now < campaign.startDate || now > campaign.endDate) {
      return NextResponse.json({ error: "不在活动有效期内" }, { status: 400 });
    }
    if (!storeIdsAllows(campaign.storeIds, actor.storeId)) {
      return NextResponse.json({ error: "本门店未参加该活动" }, { status: 403 });
    }

    const rules = parseCashbackRules(campaign.rulesSnapshot);
    if (rules.minSpendCents > 0 && amountCents < rules.minSpendCents) {
      return NextResponse.json(
        { error: `未达到最低消费 S$${(rules.minSpendCents / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    const token = await allocateClaimToken(prisma);
    const expiresAt = claimTokenExpiry(now);

    const row = await prisma.cashbackClaimToken.create({
      data: {
        token,
        campaignId: campaign.id,
        businessId: actor.businessId,
        storeId: actor.storeId,
        staffUserId: session.userId,
        amountCents,
        receiptNote:
          typeof body.receiptNote === "string" && body.receiptNote.trim()
            ? body.receiptNote.trim().slice(0, 40)
            : null,
        expiresAt,
      },
      select: { id: true, token: true, expiresAt: true },
    });

    const claimUrl = `${publicOrigin(request)}${claimTokenPath(row.token)}`;
    // 服务端生成 SVG，避免为一个二维码在客户端引一整个 QR 库
    const qrSvg = await generateQrCodeSvg(claimUrl, 260);

    return NextResponse.json({
      data: {
        id: row.id,
        token: row.token,
        path: claimTokenPath(row.token),
        url: claimUrl,
        qrSvg,
        expiresAt: row.expiresAt.toISOString(),
        ttlMinutes: CLAIM_TOKEN_TTL_MINUTES,
        amountCents,
        // 预估值：实际以顾客领取时的降级档为准
        estimatedCashbackCents: Math.floor(
          (amountCents * rules.cashbackPercent) / 100
        ),
        cashbackPercent: rules.cashbackPercent,
        drawPercent: rules.drawPercent,
      },
    });
  } catch (error) {
    console.error("cashback issue-token error:", error);
    return NextResponse.json({ error: "生成失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const actor = await resolveActor(session, searchParams.get("storeId"));
    if ("error" in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const rows = await prisma.cashbackClaimToken.findMany({
      where: { storeId: actor.storeId, createdAt: { gte: dayStart } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        token: true,
        amountCents: true,
        status: true,
        expiresAt: true,
        claimedAt: true,
        receiptNote: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    return NextResponse.json({
      data: {
        tokens: rows.map((r) => ({
          ...r,
          status:
            r.status === "pending" && r.expiresAt.getTime() <= now
              ? "expired"
              : r.status,
          expiresAt: r.expiresAt.toISOString(),
          claimedAt: r.claimedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        todayCount: rows.length,
        todayClaimed: rows.filter((r) => r.status === "claimed").length,
      },
    });
  } catch (error) {
    console.error("cashback issue-token GET error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
