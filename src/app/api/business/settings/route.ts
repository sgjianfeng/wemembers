import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/business/settings
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        businessName: true,
        businessSlug: true,
        businessCategory: true,
        email: true,
        phone: true,
        displayName: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("business settings GET error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

// PATCH /api/business/settings — update company profile fields
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    const body = await request.json();
    const data: {
      businessName?: string;
      businessCategory?: string | null;
      displayName?: string | null;
      phone?: string | null;
    } = {};

    if (typeof body.businessName === "string") {
      const name = body.businessName.trim();
      if (!name) {
        return NextResponse.json({ error: "公司名称不能为空" }, { status: 400 });
      }
      data.businessName = name.slice(0, 80);
    }
    if (typeof body.businessCategory === "string") {
      data.businessCategory = body.businessCategory.trim().slice(0, 40) || null;
    }
    if (typeof body.displayName === "string") {
      data.displayName = body.displayName.trim().slice(0, 40) || null;
    }
    if (typeof body.phone === "string") {
      data.phone = body.phone.trim().slice(0, 30) || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: {
        businessName: true,
        businessSlug: true,
        businessCategory: true,
        email: true,
        phone: true,
        displayName: true,
      },
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("business settings PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
