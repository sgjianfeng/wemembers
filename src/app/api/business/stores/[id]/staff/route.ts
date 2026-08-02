import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeSingaporePhone } from "@/lib/utils";

/**
 * 店员手机号统一存 E.164（+65XXXXXXXX），与登录 / 验证码一致。
 * 同时返回历史本地号变体，便于查库兼容旧数据。
 */
function staffPhoneKeys(raw: string): {
  e164: string;
  local8: string | null;
  bare65: string | null;
} {
  const e164 = normalizeSingaporePhone(raw);
  const digits = e164.replace(/\D/g, "");
  let local8: string | null = null;
  let bare65: string | null = null;
  if (digits.startsWith("65") && digits.length === 10) {
    bare65 = digits;
    local8 = digits.slice(2);
  } else if (/^[89]\d{7}$/.test(digits)) {
    local8 = digits;
    bare65 = `65${digits}`;
  }
  return { e164, local8, bare65 };
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
  const { e164, local8, bare65 } = staffPhoneKeys(phoneRaw);
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  // 必须是新加坡 8 位手机（E.164 为 +65 + 8 位）
  if (!e164.startsWith("+65") || e164.length !== 11) {
    return NextResponse.json(
      { error: "请填写有效的新加坡手机号（8 位，如 91234567）" },
      { status: 400 }
    );
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  const store = await prisma.store.findFirst({
    where: { id: storeId, businessId: session.userId },
  });
  if (!store) return NextResponse.json({ error: "门店不存在" }, { status: 404 });

  // 查找：优先 E.164，再兼容历史本地号 / 65 前缀
  const candidates = [e164, local8, bare65].filter(Boolean) as string[];
  let staffUser = null as Awaited<
    ReturnType<typeof prisma.user.findUnique>
  >;
  for (const p of candidates) {
    staffUser = await prisma.user.findUnique({ where: { phone: p } });
    if (staffUser) break;
  }

  // 顾客账号专用于收券，不可直接改成店员（否则满赠/发券找不到客户）
  if (staffUser?.role === "customer") {
    return NextResponse.json(
      {
        error:
          "该手机号已是顾客账号（用于收券）。店员请换一个手机号；发券请走「活动券 / 满赠台」。",
      },
      { status: 409 }
    );
  }
  if (staffUser && staffUser.role !== "staff") {
    return NextResponse.json({ error: "该用户已是其他角色" }, { status: 409 });
  }

  const passwordHash = password ? await hashPassword(password) : undefined;

  if (staffUser) {
    // 已有店员：纠正 E.164、换绑门店、可更新密码
    staffUser = await prisma.user.update({
      where: { id: staffUser.id },
      data: {
        role: "staff",
        storeId,
        displayName: displayName || staffUser.displayName,
        phone: e164,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });
  } else {
    // 若 E.164 空闲但本地号被企业占用，店员仍可用 E.164 新建
    staffUser = await prisma.user.create({
      data: {
        phone: e164,
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
