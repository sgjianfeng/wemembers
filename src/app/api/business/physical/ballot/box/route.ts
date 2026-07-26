import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhysicalCode } from "@/lib/physical-tickets";

/**
 * POST /api/business/physical/ballot/box
 * 入箱票标记已投入抽奖箱（仪式状态，不核销消费）
 * body: { code: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (
      !session ||
      (session.role !== "business" && session.role !== "staff")
    ) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const code = normalizePhysicalCode(
      typeof body.code === "string" ? body.code : ""
    );
    if (!code) {
      return NextResponse.json({ error: "请输入入箱票码" }, { status: 400 });
    }

    const ticket = await prisma.physicalTicket.findUnique({
      where: { code },
      include: {
        batch: {
          select: {
            id: true,
            type: true,
            title: true,
            businessId: true,
            valueCents: true,
            contributionCents: true,
            status: true,
          },
        },
      },
    });

    if (!ticket || ticket.batch.status === "void") {
      return NextResponse.json({ error: "无效票码" }, { status: 404 });
    }
    if (ticket.batch.type !== "ballot") {
      return NextResponse.json(
        { error: "该码不是入箱抽奖票" },
        { status: 400 }
      );
    }

    // 权限：本企业
    if (session.role === "business") {
      if (ticket.batch.businessId !== session.userId) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }
    } else {
      const store = session.storeId
        ? await prisma.store.findUnique({
            where: { id: session.storeId },
            select: { businessId: true },
          })
        : null;
      if (!store || store.businessId !== ticket.batch.businessId) {
        return NextResponse.json({ error: "无权操作" }, { status: 403 });
      }
    }

    if (ticket.status === "void") {
      return NextResponse.json({ error: "票已作废" }, { status: 400 });
    }
    if (ticket.status === "redeemed" || ticket.drawnAt) {
      return NextResponse.json({ error: "票已开箱/结束" }, { status: 400 });
    }

    const updated = await prisma.physicalTicket.update({
      where: { id: ticket.id },
      data: {
        status: ticket.status === "printed" ? "sold" : ticket.status,
        boxedAt: ticket.boxedAt || new Date(),
        soldAt: ticket.soldAt || new Date(),
        soldById: ticket.soldById || session.userId,
      },
    });

    return NextResponse.json({
      data: {
        code: updated.code,
        status: updated.status,
        boxedAt: updated.boxedAt,
        title: ticket.batch.title,
        valueCents: ticket.batch.valueCents,
        contributionCents: ticket.batch.contributionCents,
        message: "已记入抽奖箱",
      },
    });
  } catch (error) {
    console.error("ballot box error:", error);
    return NextResponse.json({ error: "入箱失败" }, { status: 500 });
  }
}
