// src/app/api/voucher/redeem/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { voucherId, amountCents } = body;

  if (!voucherId || !amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId, status: "active" },
    include: { campaign: { select: { budgetPercent: true } } },
  });

  if (!voucher) {
    return NextResponse.json({ error: "Voucher not found or exhausted" }, { status: 404 });
  }

  if (amountCents > voucher.balanceCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  // 核销方必须已加入余额消费网络（至少有一个 lucky_draw_v2 活动）
  const storeId = session.storeId;
  let redeemerStore: { id: string; businessId: string } | null = null;
  let redeemerBusinessId: string;

  if (storeId) {
    redeemerStore = await prisma.store.findUnique({ where: { id: storeId } });
    if (redeemerStore) {
      redeemerBusinessId = redeemerStore.businessId;
    } else {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
  } else {
    // business owner redeeming directly (no store assignment)
    redeemerStore = null;
    redeemerBusinessId = session.userId;
  }

  const inNetwork = await prisma.campaign.findFirst({
    where: { businessId: redeemerBusinessId, type: "lucky_draw_v2" },
    select: { id: true },
  });
  if (!inNetwork) {
    return NextResponse.json(
      { error: "This store is not in the voucher spending network. Join a lucky_draw_v2 campaign first." },
      { status: 403 }
    );
  }

  const budgetPercent = voucher.campaign?.budgetPercent || 20;
  const feeCents = Math.round(amountCents * budgetPercent / 100);
  const storeIncome = amountCents - feeCents;

  // Create usage record — only when a real store is available
  let usageId: string | null = null;

  if (redeemerStore) {
      const usage = await prisma.voucherUsage.create({
        data: {
          voucherId: voucher.id,
          storeId,
          amountCents,
          feeCents,
          storeIncome,
        },
      });
      usageId = usage.id;
  }

  // Update voucher balance
  const newBalance = voucher.balanceCents - amountCents;
  const newUsed = voucher.usedCents + amountCents;
  const newStatus = newBalance <= 0 ? "exhausted" : "active";

  await prisma.voucher.update({
    where: { id: voucher.id },
    data: {
      balanceCents: newBalance,
      usedCents: newUsed,
      status: newStatus,
    },
  });

  return NextResponse.json({
    data: {
      usage: usageId ? {
        id: usageId,
        amountSgd: (amountCents / 100).toFixed(2),
        feeSgd: (feeCents / 100).toFixed(2),
        storeIncomeSgd: (storeIncome / 100).toFixed(2),
      } : null,
      voucher: {
        id: voucher.id,
        remainingBalanceSgd: (newBalance / 100).toFixed(2),
        status: newStatus,
      },
    },
  });
}
