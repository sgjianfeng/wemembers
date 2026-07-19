import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  resolveBusinessCurrentStore,
  resolveStaffStore,
  setStoreCookie,
  getStoreCookieId,
} from "@/lib/current-store";
import { prisma } from "@/lib/db";

// GET — 门店列表 + 当前门店
export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    if (session.role === "staff") {
      const store = await resolveStaffStore(session.storeId);
      return NextResponse.json({
        data: {
          stores: store ? [store] : [],
          current: store,
          locked: true,
        },
      });
    }

    const { stores, current } = await resolveBusinessCurrentStore(session.userId);
    return NextResponse.json({
      data: { stores, current, locked: false },
    });
  } catch (error) {
    console.error("stores/current GET error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

// POST — 切换当前门店 { storeId }
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "business") {
      return NextResponse.json(
        { error: "仅企业账号可切换门店" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    if (!storeId) {
      return NextResponse.json({ error: "缺少门店" }, { status: 400 });
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId: session.userId },
      select: { id: true, name: true, slug: true, address: true },
    });
    if (!store) {
      return NextResponse.json({ error: "门店不存在" }, { status: 404 });
    }

    await setStoreCookie(store.id);

    return NextResponse.json({ data: { current: store } });
  } catch (error) {
    console.error("stores/current POST error:", error);
    return NextResponse.json({ error: "切换失败" }, { status: 500 });
  }
}
