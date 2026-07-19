import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isValidBusinessSlug,
  isValidSingaporeUen,
  normalizeUen,
} from "@/lib/utils";

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
        businessUen: true,
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
      businessSlug?: string;
      businessUen?: string | null;
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

    if (typeof body.businessUen === "string") {
      const u = body.businessUen.trim();
      if (u) {
        if (!isValidSingaporeUen(u)) {
          return NextResponse.json({ error: "UEN 格式无效" }, { status: 400 });
        }
        const uen = normalizeUen(u);
        const taken = await prisma.user.findFirst({
          where: { businessUen: uen, id: { not: session.userId } },
          select: { id: true },
        });
        if (taken) {
          return NextResponse.json({ error: "该 UEN 已被其他账号使用" }, { status: 409 });
        }
        data.businessUen = uen;
      }
    }

    if (typeof body.businessSlug === "string") {
      const slug = body.businessSlug.trim().toLowerCase().replace(/^-+|-+$/g, "");
      if (!isValidBusinessSlug(slug)) {
        return NextResponse.json(
          { error: "英文标识须为 2–48 位小写字母、数字或连字符" },
          { status: 400 }
        );
      }
      const taken = await prisma.user.findFirst({
        where: {
          businessSlug: slug,
          id: { not: session.userId },
        },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "该英文标识已被占用，请换一个" },
          { status: 409 }
        );
      }
      data.businessSlug = slug;
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
        businessUen: true,
        businessCategory: true,
        email: true,
        phone: true,
        displayName: true,
      },
    });

    // 企业改名不再自动改门店名（门店独立）

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("business settings PATCH error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
