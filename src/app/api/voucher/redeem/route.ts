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

  const budgetPercent = voucher.campaign?.budgetPercent || 20;
  const feeCents = Math.round(amountCents * budgetPercent / 100);
  const storeIncome = amountCents - feeCents;

  // Get the store from session — only create usage when a real store is available
  const storeId = session.storeId;
  let usageId: string | null = null;

  if (storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (store) {
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
