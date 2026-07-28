import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ballotGrandContributionCents } from "@/lib/store-defaults";
import {
  isVisualTemplateId,
  resolveThemeHex,
} from "@/lib/visual-templates";

/** 是否已有「发出」记录：有则禁止改金额/标题等，只允许下架库存 */
async function batchIssuance(batchId: string) {
  const tickets = await prisma.physicalTicket.findMany({
    where: { batchId },
    select: { status: true },
  });
  const stock = tickets.filter((t) => t.status === "printed").length;
  const issued = tickets.some(
    (t) =>
      t.status === "sold" ||
      t.status === "claimed" ||
      t.status === "redeemed" ||
      t.status === "boxed"
  );
  return { tickets, stock, issued, total: tickets.length };
}

// GET /api/business/physical/batches/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id } = await params;
  const batch = await prisma.physicalBatch.findFirst({
    where: { id, businessId: session.userId },
    include: {
      store: { select: { id: true, name: true, address: true } },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          claimedAt: true,
          redeemedAt: true,
          customerId: true,
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  }

  const issued = batch.tickets.some(
    (t) =>
      t.status === "sold" ||
      t.status === "claimed" ||
      t.status === "redeemed" ||
      t.status === "boxed"
  );

  return NextResponse.json({
    data: {
      ...batch,
      meta: {
        issued,
        editable: !issued && batch.status !== "void",
        stock: batch.tickets.filter((t) => t.status === "printed").length,
      },
    },
  });
}

/**
 * PATCH /api/business/physical/batches/[id]
 *
 * 规则：
 * - 未售出（全部仍为 printed / void）：可改金额、有效期、标题、条款、主题；可整批删除
 * - 已售出过：禁止改金额等；仅 void_remaining 下架剩余库存
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    const batch = await prisma.physicalBatch.findFirst({
      where: { id, businessId: session.userId },
      select: {
        id: true,
        status: true,
        type: true,
        title: true,
        description: true,
        valueCents: true,
        contributionCents: true,
        validUntil: true,
        themeColor: true,
        visualTemplateId: true,
      },
    });
    if (!batch) {
      return NextResponse.json({ error: "批次不存在" }, { status: 404 });
    }

    const issuance = await batchIssuance(id);

    // ── 下架剩余：已售/未售都可用 ──
    if (action === "void_remaining") {
      if (batch.status === "void" && issuance.stock === 0) {
        return NextResponse.json({
          data: { id, status: "void", voidedStock: 0 },
        });
      }
      const voided = await prisma.$transaction(async (tx) => {
        const r = await tx.physicalTicket.updateMany({
          where: { batchId: id, status: "printed" },
          data: { status: "void" },
        });
        await tx.physicalBatch.update({
          where: { id },
          data: { status: "void" },
        });
        return r.count;
      });

      return NextResponse.json({
        data: { id, status: "void", voidedStock: voided },
      });
    }

    // ── 以下改动：仅未发出过 ──
    if (issuance.issued) {
      return NextResponse.json(
        {
          error:
            "本批已有售出/绑定/核销，不能再改金额或票面。请「作废剩余库存」下架未售码；已发出的票仍按原规则有效。",
        },
        { status: 400 }
      );
    }

    if (action === "update_batch" || action === "update_valid_until") {
      // 兼容旧 action 名 update_valid_until → 走同一套未售编辑
      const data: {
        title?: string;
        description?: string | null;
        valueCents?: number;
        contributionCents?: number;
        validUntil?: Date | null;
        themeColor?: string | null;
        visualTemplateId?: string;
      } = {};

      if (typeof body.title === "string") {
        const t = body.title.trim().slice(0, 80);
        if (t) data.title = t;
      }

      if (body.description !== undefined) {
        if (body.description === null || body.description === "") {
          data.description = null;
        } else if (typeof body.description === "string") {
          data.description = body.description.trim().slice(0, 500);
        }
      }

      if (body.valueCents !== undefined || body.valueSgd !== undefined) {
        let valueCents =
          body.valueCents !== undefined
            ? Math.round(Number(body.valueCents) || 0)
            : Math.round(parseFloat(String(body.valueSgd || "0")) * 100);
        valueCents = Math.max(0, valueCents);
        if (valueCents < 100) {
          return NextResponse.json(
            { error: "面值/档位至少 S$1.00" },
            { status: 400 }
          );
        }
        data.valueCents = valueCents;
        if (batch.type === "ballot") {
          data.contributionCents = ballotGrandContributionCents(valueCents);
        }
      }

      const validRaw =
        typeof body.validUntil === "string" ? body.validUntil.trim() : "";
      if (validRaw) {
        let until: Date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(validRaw)) {
          until = new Date(`${validRaw}T23:59:59`);
        } else {
          until = new Date(validRaw);
        }
        if (Number.isNaN(until.getTime())) {
          return NextResponse.json(
            { error: "有效期格式无效" },
            { status: 400 }
          );
        }
        if (until.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
          return NextResponse.json(
            { error: "有效期过旧，请选今天或之后的日期" },
            { status: 400 }
          );
        }
        data.validUntil = until;
      }

      if (typeof body.visualTemplateId === "string") {
        const raw = body.visualTemplateId.trim();
        if (isVisualTemplateId(raw)) {
          data.visualTemplateId = raw;
        }
      }
      if (body.themeColor !== undefined) {
        const hex =
          typeof body.themeColor === "string" ? body.themeColor.trim() : null;
        data.themeColor = hex
          ? resolveThemeHex(hex, data.visualTemplateId || batch.visualTemplateId)
          : null;
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { error: "没有可更新的字段" },
          { status: 400 }
        );
      }

      const updated = await prisma.physicalBatch.update({
        where: { id },
        data,
        select: {
          id: true,
          title: true,
          description: true,
          valueCents: true,
          contributionCents: true,
          validUntil: true,
          themeColor: true,
          visualTemplateId: true,
          status: true,
          type: true,
        },
      });

      return NextResponse.json({
        data: { ...updated, meta: { issued: false, editable: true } },
      });
    }

    if (action === "delete_if_unused") {
      // 仅未发出
      await prisma.$transaction(async (tx) => {
        await tx.physicalTicket.deleteMany({ where: { batchId: id } });
        await tx.physicalBatch.delete({ where: { id } });
      });
      return NextResponse.json({ data: { id, deleted: true } });
    }

    return NextResponse.json(
      {
        error:
          "未知操作（支持 update_batch | void_remaining | delete_if_unused）",
      },
      { status: 400 }
    );
  } catch (e) {
    console.error("physical batch PATCH error:", e);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
