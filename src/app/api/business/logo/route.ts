import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { putBusinessBrandImage } from "@/services/storage";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
// image/jpg 部分浏览器/系统会报这个（非标准，一并接受）
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

// POST /api/business/logo — multipart file → 更新 businessLogo（通用品牌资产）
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "仅支持 PNG / JPG / WebP / GIF" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "图片需小于 2MB" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await putBusinessBrandImage(
      session.userId,
      bytes,
      file.type,
      "logo"
    );

    const user = await prisma.user.update({
      where: { id: session.userId },
      data: { businessLogo: stored.url },
      select: { businessLogo: true, businessName: true },
    });

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("business logo upload error:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

// DELETE /api/business/logo — 清除 Logo
export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { businessLogo: null },
  });

  return NextResponse.json({ data: { businessLogo: null } });
}
