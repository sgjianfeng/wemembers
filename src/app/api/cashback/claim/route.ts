// GET  /api/cashback/claim?token= — 扫码后预览（公开）
// POST /api/cashback/claim        — 绑手机领取（公开；金额来自令牌，顾客不可填）
//
// 顾客不提供金额——金额由店员在收银时录入并固化在令牌上。
// 令牌一次性：consumeClaimToken 用条件更新保证并发扫码只有一个成功。
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  loadClaimToken,
  consumeClaimToken,
  claimTokenErrorMessage,
} from "@/lib/cashback-token";
import {
  recordSpend,
  parseCashbackRules,
  cashbackErrorMessage,
  CashbackError,
} from "@/lib/cashback";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get("token") || "").trim();
    if (!token) {
      return NextResponse.json({ error: "缺少二维码标识" }, { status: 400 });
    }

    const loaded = await loadClaimToken(prisma, token);
    if (!loaded) {
      return NextResponse.json({ error: "二维码无效" }, { status: 404 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: loaded.campaignId },
      select: { rulesSnapshot: true },
    });
    const rules = parseCashbackRules(campaign?.rulesSnapshot ?? null);

    const session = await getSession();

    return NextResponse.json({
      data: {
        state: loaded.state,
        claimable: loaded.state === "pending",
        message:
          loaded.state === "pending" ? null : claimTokenErrorMessage(loaded.state),
        amountCents: loaded.amountCents,
        storeName: loaded.storeName,
        businessName: loaded.businessName,
        campaignName: loaded.campaignName,
        expiresAt: loaded.expiresAt.toISOString(),
        // 预估值：实际以领取时的降级档为准
        estimatedCashbackCents: Math.floor(
          (loaded.amountCents * rules.cashbackPercent) / 100
        ),
        cashbackPercent: rules.cashbackPercent,
        drawPercent: rules.drawPercent,
        inactivityMonths: rules.inactivityMonths,
        loggedInAsCustomer: session?.role === "customer",
      },
    });
  } catch (error) {
    console.error("cashback claim GET error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "缺少二维码标识" }, { status: 400 });
    }

    // 手机号：已登录顾客用账号手机，否则用提交的手机
    let phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const session = await getSession();
    if (session?.role === "customer") {
      const me = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { phone: true },
      });
      if (me?.phone) phone = me.phone;
    }
    if (!phone) {
      return NextResponse.json({ error: "请填写手机号" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadClaimToken(tx, token);
      if (!loaded) throw new CashbackError("TOKEN_NOT_FOUND");
      if (loaded.state !== "pending") {
        throw new CashbackError(`TOKEN_${loaded.state.toUpperCase()}`);
      }

      const spend = await recordSpend(tx, {
        campaignId: loaded.campaignId,
        businessId: loaded.businessId,
        storeId: loaded.storeId,
        phone,
        amountCents: loaded.amountCents,
        source: "staff",
        staffUserId: loaded.staffUserId,
        receiptNote: loaded.receiptNote,
        // 金额由店员录入并已在出码时校验过上限
        allowLargeAmount: true,
      });

      // 原子消费：并发扫同一个码只有一个成功
      const consumed = await consumeClaimToken(tx, loaded.id, {
        customerId: spend.customerId,
        spendRecordId: spend.spendRecordId,
      });
      if (!consumed) throw new CashbackError("TOKEN_CLAIMED");

      return { loaded, spend };
    });

    const { loaded, spend } = result;
    return NextResponse.json({
      data: {
        amountCents: loaded.amountCents,
        storeName: loaded.storeName,
        cashbackCents: spend.accrual.cashbackCents,
        cashbackPercent: spend.accrual.cashbackPercent,
        shortCode: spend.cashbackShortCode,
        pointsAwarded: spend.pointsAwarded,
        newTier: spend.newTier,
        fundingTier: spend.fundingTier,
        cappedByDaily: spend.cappedByDaily,
        instantPrize: spend.instantPrize,
        grandProgress: spend.grandProgress,
      },
    });
  } catch (error) {
    if (error instanceof CashbackError) {
      const tokenMsg: Record<string, string> = {
        TOKEN_NOT_FOUND: "二维码无效",
        TOKEN_CLAIMED: "该二维码已被领取",
        TOKEN_EXPIRED: "二维码已过期，请让店员重新生成",
        TOKEN_VOID: "该二维码已作废",
      };
      const msg = tokenMsg[error.code] || cashbackErrorMessage(error.code);
      const status = error.code.startsWith("TOKEN_") ? 409 : 400;
      return NextResponse.json({ error: msg, code: error.code }, { status });
    }
    console.error("cashback claim POST error:", error);
    return NextResponse.json({ error: "领取失败" }, { status: 500 });
  }
}
