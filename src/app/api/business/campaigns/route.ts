import { NextRequest, NextResponse } from "next/server";
import {
  buildRulesSnapshot,
  getTemplate,
  isExclusiveTemplateId,
  type TemplateId,
} from "@/lib/templates";
import { buildSnapshotFromBusinessTemplate } from "@/lib/business-templates";
import { serializeStoreIds } from "@/lib/utils";

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
    const isPlatform = isPlatformAccount(user.email || "");

    // ── 企业自定义模版 或 平台模版 ──
    if (body.businessTemplateId || body.templateId) {
      let templateId = body.templateId as TemplateId | undefined;
      let tpl = templateId ? getTemplate(templateId) : undefined;
      let fromBusinessTemplate: {
        id: string;
        baseTemplateId: string;
        discountPercent: number | null;
        exclusiveTotalPercent: number | null;
        exclusiveSmallPrizePercent: number | null;
        exclusivePlatformFeePercent: number | null;
        exclusiveGrandPoolPercent: number | null;
        enabledTiers: string | null;
      } | null = null;

      if (body.businessTemplateId) {
        const bt = await prisma.businessTemplate.findFirst({
          where: {
            id: body.businessTemplateId,
            businessId: session.userId,
            status: "active",
          },
        });
        if (!bt) {
          return NextResponse.json(
            { error: "企业模版不存在或已归档" },
            { status: 404 }
          );
        }
        fromBusinessTemplate = bt;
        templateId = bt.baseTemplateId as TemplateId;
        tpl = getTemplate(templateId);
      }

      if (!templateId || !tpl) {
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
        productKind: bodyProductKind,
      } = body;

      // productKind：模版默认优先；body 可覆盖（share_boost 强制分发）
      let productKind: "self_use" | "distribution" =
        tpl.rules.defaultProductKind ||
        (bodyProductKind === "self_use" ? "self_use" : "distribution");
      if (bodyProductKind === "self_use" || bodyProductKind === "distribution") {
        if (!isExclusiveTemplateId(templateId) && templateId !== "self_use_voucher") {
          productKind = bodyProductKind;
        }
      }
      if (templateId === "share_boost") {
        productKind = "distribution";
      }
      if (
        isExclusiveTemplateId(templateId) ||
        templateId === "self_use_voucher" ||
        fromBusinessTemplate
      ) {
        productKind = "self_use";
      }

      if (!name || !startDate || !endDate) {
        return NextResponse.json({ error: "请填写活动名称和时间" }, { status: 400 });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ error: "结束日期不能早于开始日期" }, { status: 400 });
      }

      let snapshot;
      try {
        if (fromBusinessTemplate) {
          snapshot = buildSnapshotFromBusinessTemplate(fromBusinessTemplate);
          snapshot.businessTemplateId = fromBusinessTemplate.id;
        } else {
          snapshot = buildRulesSnapshot({
            templateId,
            discountPercent,
            enabledTiers,
            shareSellingEnabled,
            grandPrizes: Array.isArray(grandPrizes) ? grandPrizes : undefined,
          });
        }
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "模板参数无效" },
          { status: 400 }
        );
      }
      snapshot.productKind = productKind;

      // 公司同一时间只能有一个 active 独享抽奖
      const willBeActive = new Date(startDate) <= new Date();
      const isExclusiveDraw =
        productKind === "self_use" &&
        (snapshot.campaignType === "lucky_draw_v2" ||
          isExclusiveTemplateId(templateId));
      if (isExclusiveDraw && willBeActive) {
        const existing = await prisma.campaign.findFirst({
          where: {
            businessId: session.userId,
            productKind: "self_use",
            type: "lucky_draw_v2",
            status: "active",
          },
          select: { id: true, name: true },
        });
        if (existing) {
          return NextResponse.json(
            {
              error: `已有进行中的独享抽奖「${existing.name}」。请先结束/停用后再创建，避免同时多种独享。`,
              code: "EXCLUSIVE_ALREADY_ACTIVE",
              existingId: existing.id,
            },
            { status: 409 }
          );
        }
      }

      const myStores = await prisma.store.findMany({
        where: { businessId: session.userId },
        select: { id: true },
      });
      const allMyStoreIds = myStores.map((s) => s.id);

      let partnerIdList: string[] = [];
      if (Array.isArray(partnerIds)) {
        partnerIdList = partnerIds.filter(
          (id: unknown) => typeof id === "string" && id !== session.userId
        );
      }

      // 分发：默认启用本公司全部门店 + 伙伴门店
      // 自用/独享：门店选用 opt-in，初始 []（创建后各店自行上架）
      let finalStoreIds: string[] = [];
      if (productKind === "self_use") {
        // 可选：body.enabledStoreIds 首批启用
        if (Array.isArray(body.enabledStoreIds)) {
          const allowed = new Set(allMyStoreIds);
          finalStoreIds = body.enabledStoreIds.filter(
            (id: unknown): id is string =>
              typeof id === "string" && allowed.has(id)
          );
        } else {
          finalStoreIds = [];
        }
      } else {
        finalStoreIds = [...allMyStoreIds];
        if (partnerIdList.length > 0) {
          const partnerStores = await prisma.store.findMany({
            where: { businessId: { in: partnerIdList } },
            select: { id: true },
          });
          for (const s of partnerStores) {
            if (!finalStoreIds.includes(s.id)) finalStoreIds.push(s.id);
          }
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

      const autoSlug =
        slug ||
        (snapshot.campaignType === "lucky_draw_v2" ||
        snapshot.campaignType === "voucher_sale" ||
        snapshot.kind === "draw"
          ? `${templateId}-${Date.now().toString(36)}`
          : null);

      const finalPartnerIds =
        productKind === "self_use" ? [] : partnerIdList;
      const finalJoinable =
        productKind === "self_use"
          ? false
          : isPlatform
            ? true
            : Boolean(joinable) && isPlatform;

      // 自用：显式列表（含 []）；分发：有店则写列表，无店 null
      const storeIdsJson =
        productKind === "self_use"
          ? serializeStoreIds(finalStoreIds)
          : finalStoreIds.length
            ? serializeStoreIds(finalStoreIds)
            : null;

      const campaign = await prisma.campaign.create({
        data: {
          businessId: session.userId,
          name,
          description: description || null,
          type: snapshot.campaignType,
          color: color || (productKind === "self_use" ? "#64748B" : "#1A6EFF"),
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          drawDate: snapshot.kind === "draw" ? new Date(endDate) : null,
          budgetPercent: productKind === "self_use" ? 0 : 20,
          instantPoolRatio: snapshot.instantPoolRatio,
          midPoolRatio: snapshot.midPoolRatio,
          grandPoolRatio: snapshot.grandPoolRatio,
          voucherTiers: voucherTiers.length
            ? JSON.stringify(voucherTiers)
            : null,
          slug: autoSlug,
          joinable: finalJoinable,
          joinCount: finalPartnerIds.length,
          allowCollaboration: productKind !== "self_use",
          partnerIds: finalPartnerIds.length
            ? JSON.stringify(finalPartnerIds)
            : null,
          storeIds: storeIdsJson,
          templateId: snapshot.templateId,
          rulesSnapshot: JSON.stringify(snapshot),
          tags: JSON.stringify([
            snapshot.templateId,
            productKind === "self_use" ? "self_use" : "distribution",
            ...(snapshot.exclusiveFeeTotalPercent
              ? [`exclusive_${snapshot.exclusiveFeeTotalPercent}`]
              : []),
          ]),
          status: willBeActive ? "active" : "draft",
          entryMethod: "auto",
          productKind,
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
