import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { drawInstantV2, resolveTier, calculateTierWeight } from "@/lib/draw-v2";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const body = await request.json();
  const { amountSgd, spendNowSgd } = body;
  const amountCents = Math.round((amountSgd || 0) * 100);
  const spendNowCents = Math.round((spendNowSgd || 0) * 100);

  if (amountCents <= 0 || spendNowCents < 0 || spendNowCents > amountCents) {
    return NextResponse.json({ error: "Invalid amounts" }, { status: 400 });
  }

  // Validate campaign
  const campaign = await prisma.campaign.findUnique({
    where: { slug, type: "lucky_draw_v2", status: "active" },
  });
  if (!campaign || new Date() > campaign.endDate) {
    return NextResponse.json({ error: "Campaign not available" }, { status: 404 });
  }

  // Resolve tier
  const tier = resolveTier(amountSgd);
  if (!tier) return NextResponse.json({ error: "Invalid voucher amount" }, { status: 400 });

  // Calculate pool contribution
  const budgetPercent = campaign.budgetPercent || 20;
  const prizePoolContribution = Math.round(amountCents * budgetPercent / 100);
  const balanceCents = amountCents - spendNowCents;
  const weight = calculateTierWeight(amountCents, tier.tier);

  // Create voucher
  const voucher = await prisma.voucher.create({
    data: {
      customerId: session.userId,
      campaignId: campaign.id,
      amountCents,
      usedCents: spendNowCents,
      balanceCents,
      prizePoolContribution,
      drawWeight: weight,
      tier: tier.tier,
    },
  });

  // Record first spend (in-store consumption)
  if (spendNowCents > 0) {
    // Find the business's primary store for the usage record
    const store = await prisma.store.findFirst({
      where: { businessId: campaign.businessId },
    });
    const storeId = store?.id ?? campaign.businessId; // fallback for backwards compat
    await prisma.voucherUsage.create({
      data: {
        voucherId: voucher.id,
        storeId,
        amountCents: spendNowCents,
        feeCents: Math.round(spendNowCents * budgetPercent / 100),
        storeIncome: spendNowCents - Math.round(spendNowCents * budgetPercent / 100),
      },
    });
  }

  // Instant draw (100% win)
  const instantPoolCents = campaign.instantPoolCents || 0;
  const instantResult = drawInstantV2(tier, instantPoolCents);

  // Record instant draw
  const drawRecord = await prisma.voucherDraw.create({
    data: {
      voucherId: voucher.id,
      drawType: "instant",
      won: true,
      prizeName: instantResult.prize.name,
      prizeIcon: instantResult.prize.icon,
      valueCents: instantResult.prize.valueCents,
      weightAtTime: weight,
    },
  });

  // Update campaign counters
  const newInstantPoolCents = instantPoolCents + prizePoolContribution;
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      entryCount: { increment: 1 },
      totalTicketCount: { increment: 1 },
      instantPoolCents: newInstantPoolCents,
    },
  });

  return NextResponse.json({
    data: {
      voucher: {
        id: voucher.id,
        amountSgd: (amountCents / 100).toFixed(2),
        balanceSgd: (balanceCents / 100).toFixed(2),
        tier: voucher.tier,
        drawWeight: weight,
      },
      instantPrize: {
        name: instantResult.prize.name,
        icon: instantResult.prize.icon,
        valueSgd: (instantResult.prize.valueCents / 100).toFixed(2),
      },
      grandPoolEntry: tier.tier !== "small",
    },
  });
}
