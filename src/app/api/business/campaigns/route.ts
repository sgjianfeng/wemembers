import { NextRequest, NextResponse } from "next/server";
import {
  buildRulesSnapshot,
  getTemplate,
  type TemplateId,
} from "@/lib/templates";

function isPlatformAccount(email: string): boolean {
  const platformEmail = process.env.PLATFORM_ACCOUNT_EMAIL;
  if (!platformEmail) return false;
  return email === platformEmail;
}

// GET /api/business/campaigns — 活动列表
export async function GET(request: NextRequest) {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { prisma } = await import("@/lib/db");
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;

  const where: { businessId: string; status?: string } = { businessId: session.userId };
  if (status) where.status = status;

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      coupons: {
        select: { id: true, title: true, claimedCount: true, usedCount: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: campaigns });
}

// POST /api/business/campaigns — 创建活动（推荐：传 templateId）
export async function POST(request: NextRequest) {
  try {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { prisma } = await import("@/lib/db");
    const body = await request.json();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });
    if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    const isPlatform = isPlatformAccount(user.email);

    // ── Template-based create (preferred) ──
    if (body.templateId) {
      const templateId = body.templateId as TemplateId;
      const tpl = getTemplate(templateId);
      if (!tpl) {
        return NextResponse.json({ error: "未知模板" }, { status: 400 });
      }

      const {
        name,
        description,
        color,
        startDate,
        endDate,
        discountPercent,
        enabledTiers,
        shareSellingEnabled,
        partnerIds,
        slug,
        joinable,
        grandPrizes,
      } = body;

      if (!name || !startDate || !endDate) {
        return NextResponse.json({ error: "请填写活动名称和时间" }, { status: 400 });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ error: "结束日期不能早于开始日期" }, { status: 400 });
      }

      let snapshot;
      try {
        snapshot = buildRulesSnapshot({
          templateId,
          discountPercent,
          enabledTiers,
          shareSellingEnabled,
          grandPrizes: Array.isArray(grandPrizes) ? grandPrizes : undefined,
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "模板参数无效" },
          { status: 400 }
        );
      }

      // Resolve initiator stores for storeIds seed
      const myStores = await prisma.store.findMany({
        where: { businessId: session.userId },
        select: { id: true },
      });
      const storeIds = myStores.map((s) => s.id);

      let partnerIdList: string[] = [];
      if (Array.isArray(partnerIds)) {
        partnerIdList = partnerIds.filter((id: unknown) => typeof id === "string" && id !== session.userId);
      }

      // Invite partners: append their store ids (sell + redeem network)
      if (partnerIdList.length > 0) {
        const partnerStores = await prisma.store.findMany({
          where: { businessId: { in: partnerIdList } },
          select: { id: true, businessId: true },
        });
        for (const s of partnerStores) {
          if (!storeIds.includes(s.id)) storeIds.push(s.id);
        }
      }

      const voucherTiers = tpl.rules.tiers
        .filter((t) => snapshot.enabledTiers.includes(t.amountSgd))
        .map((t) => ({
          min: t.amountSgd,
          max: t.amountSgd,
          tier: t.tier,
          instantPrizeCap: t.instantPrizeCapSgd,
        }));

      // Prepaid products need a public slug for /voucher/[slug] + share QR
      const autoSlug =
        slug ||
        (snapshot.campaignType === "lucky_draw_v2" ||
        snapshot.campaignType === "voucher_sale" ||
        snapshot.kind === "draw"
          ? `${templateId}-${Date.now().toString(36)}`
          : null);

      const campaign = await prisma.campaign.create({
        data: {
          businessId: session.userId,
          name,
          description: description || null,
          type: snapshot.campaignType,
          color: color || "#1A6EFF",
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          drawDate: snapshot.kind === "draw" ? new Date(endDate) : null,
          // Redeem pot %: leftover → prize pool (draw) or store (voucher promo)
          budgetPercent: 20,
          instantPoolRatio: snapshot.instantPoolRatio,
          midPoolRatio: snapshot.midPoolRatio,
          grandPoolRatio: snapshot.grandPoolRatio,
          voucherTiers: voucherTiers.length ? JSON.stringify(voucherTiers) : null,
          slug: autoSlug,
          // Stores may invite partners; open marketplace only for platform or explicit flag
          joinable: isPlatform ? true : Boolean(joinable) && isPlatform,
          joinCount: partnerIdList.length,
          allowCollaboration: true,
          partnerIds: partnerIdList.length ? JSON.stringify(partnerIdList) : null,
          storeIds: storeIds.length ? JSON.stringify(storeIds) : null,
          templateId: snapshot.templateId,
          rulesSnapshot: JSON.stringify(snapshot),
          tags: JSON.stringify([snapshot.templateId]),
          status: new Date(startDate) <= new Date() ? "active" : "draft",
          entryMethod: "auto",
        },
      });

      return NextResponse.json({ data: campaign });
    }

    // ── Legacy create (no template) — keep for old clients ──
    const {
      name,
      description,
      type,
      color,
      startDate,
      endDate,
      budgetCents,
      tags,
      drawDate,
      minSpendCents,
      maxEntries,
      drawMethod,
      entryMethod,
      receiptMinSpend,
      ticketsPerUnit,
      budgetPercent,
      slug,
      allowCollaboration,
    } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json({ error: "请填写活动名称和时间" }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        businessId: session.userId,
        name,
        description: description || null,
        type: type || "promotion",
        color: color || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        drawDate: drawDate ? new Date(drawDate) : null,
        minSpendCents: minSpendCents || null,
        maxEntries: maxEntries || null,
        drawMethod: drawMethod || "weighted",
        entryMethod: entryMethod || "auto",
        receiptMinSpend: receiptMinSpend || null,
        ticketsPerUnit: ticketsPerUnit || 1,
        budgetPercent: budgetPercent || 20,
        slug: slug || null,
        joinable: isPlatform,
        joinCount: 0,
        allowCollaboration: allowCollaboration || false,
        budgetCents: budgetCents || null,
        tags: tags ? JSON.stringify(tags) : "[]",
        status: new Date(startDate) <= new Date() ? "active" : "draft",
      },
    });

    return NextResponse.json({ data: campaign });
  } catch (error) {
    console.error("create campaign error:", error);
    const message = error instanceof Error ? error.message : "创建失败";
    return NextResponse.json(
      { error: "创建失败", detail: process.env.NODE_ENV === "production" ? undefined : message },
      { status: 500 }
    );
  }
}
