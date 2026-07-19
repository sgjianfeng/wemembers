import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizePhone(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/^\+65/, "");
}

// GET /api/business/stores/[id]/staff — 本店店员列表
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }
  const { id: storeId } = await params;
  const store = await prisma.store.findFirst({
    where: { id: storeId, businessId: session.userId },
    select: { id: true },
  });
  if (!store) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  const staff = await prisma.user.findMany({
    where: { storeId, role: "staff" },
    select: {
      id: true,
      phone: true,
      displayName: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: staff });
}

// POST /api/business/stores/[id]/staff — 邀请店员
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { id: storeId } = await params;
  const body = await request.json();
  const phoneRaw = typeof body.phone === "string" ? body.phone : "";
  const phone = normalizePhone(phoneRaw);
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  if (!phone || phone.length < 8) {
    return NextResponse.json({ error: "请提供有效手机号" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  const store = await prisma.store.findFirst({
    where: { id: storeId, businessId: session.userId },
  });
  if (!store) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  // 查找或创建店员用户（兼容 +65 / 本地号）
  let staffUser =
    (await prisma.user.findUnique({ where: { phone } })) ||
    (await prisma.user.findUnique({ where: { phone: `+65${phone}` } }));

  if (staffUser && staffUser.role !== "customer" && staffUser.role !== "staff") {
    return NextResponse.json({ error: "该用户已是其他角色" }, { status: 409 });
  }

  const passwordHash = password ? await hashPassword(password) : undefined;

  if (staffUser) {
    staffUser = await prisma.user.update({
      where: { id: staffUser.id },
      data: {
        role: "staff",
        storeId,
        displayName: displayName || staffUser.displayName,
        phone: staffUser.phone || phone,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  } else {
    staffUser = await prisma.user.create({
      data: {
        phone,
        role: "staff",
        storeId,
        displayName: displayName || null,
        status: "active",
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  }

  return NextResponse.json({
    data: {
      id: staffUser.id,
      phone: staffUser.phone,
      displayName: staffUser.displayName,
      hasPassword: Boolean(staffUser.passwordHash),
    },
  });
}
