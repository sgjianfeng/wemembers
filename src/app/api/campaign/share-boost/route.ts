// src/app/api/campaign/share-boost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateTierWeight } from "@/lib/draw-v2";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { voucherId } = body;

  if (!voucherId) {
    return NextResponse.json({ error: "Missing voucherId" }, { status: 400 });
  }

  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
  });

  if (!voucher || voucher.customerId !== session.userId) {
    return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
  }

  // Prevent unlimited stacking: compare against tier base weight
  const balanceCents = voucher.amountCents - voucher.usedCents;
  const baseWeight = calculateTierWeight(voucher.amountCents, voucher.tier as "small" | "medium" | "large", balanceCents);
  if (voucher.drawWeight > baseWeight) {
    return NextResponse.json({ error: "already boosted" }, { status: 400 });
  }

  // Boost weight: +1× amountCents per share
  const boostAmount = voucher.amountCents;
  const newWeight = voucher.drawWeight + boostAmount;

  await prisma.voucher.update({
    where: { id: voucherId },
    data: { drawWeight: newWeight },
  });

  return NextResponse.json({
    data: {
      previousWeight: voucher.drawWeight,
      newWeight,
      boostedBy: boostAmount,
    },
  });
}
