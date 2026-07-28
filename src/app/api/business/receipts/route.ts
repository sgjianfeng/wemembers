import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { putReceiptImage } from "@/services/storage";
import { recognizeReceipt } from "@/services/ai/vision";
import { resolveBusinessActor } from "@/lib/business-actor";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"];

// GET /api/business/receipts?groupId=xxx — 该群时间线
export async function GET(request: NextRequest) {
  const session = await getSession();
  const actor = await resolveBusinessActor(session);
  if (!actor) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "缺少 groupId" }, { status: 400 });
  }

  // 归属校验
  const group = await prisma.receiptGroup.findFirst({
    where: { id: groupId, businessId: actor.businessId },
  });
  if (!group) {
    return NextResponse.json({ error: "群不存在" }, { status: 404 });
  }
  if (actor.role === "staff") {
    const roles = (group.visibleRoles || "business,staff").split(",");
    if (!roles.map((r) => r.trim()).includes("staff")) {
      return NextResponse.json({ error: "无权查看该资料群" }, { status: 403 });
    }
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      groupId,
      businessId: actor.businessId,
      // 店员优先看本店上传（含历史无 store 的企业票据则仍可见同群）
      ...(actor.role === "staff" && actor.storeId
        ? {
            OR: [{ storeId: actor.storeId }, { storeId: null }],
          }
        : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: receipts });
}

// POST /api/business/receipts — 上传票据（multipart：file + groupId），存云 + 同步识别
export async function POST(request: NextRequest) {
  const session = await getSession();
  const actor = await resolveBusinessActor(session);
  if (!actor) {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const groupId = form.get("groupId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传票据图片" }, { status: 400 });
  }
  if (typeof groupId !== "string" || !groupId) {
    return NextResponse.json({ error: "缺少 groupId" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WebP/HEIC 图片" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 400 });
  }

  const group = await prisma.receiptGroup.findFirst({
    where: { id: groupId, businessId: actor.businessId },
  });
  if (!group) {
    return NextResponse.json({ error: "群不存在" }, { status: 404 });
  }
  if (actor.role === "staff") {
    const roles = (group.visibleRoles || "business,staff").split(",");
    if (!roles.map((r) => r.trim()).includes("staff")) {
      return NextResponse.json({ error: "无权上传到该资料群" }, { status: 403 });
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // 1) 存原图（云 / 本地降级）— 路径用企业 id
  const stored = await putReceiptImage(actor.businessId, bytes, file.type);

  // 2) 建记录（processing）；店员上传打上本店 storeId
  const receipt = await prisma.receipt.create({
    data: {
      groupId,
      businessId: actor.businessId,
      storeId: actor.storeId || group.storeId,
      uploadedById: actor.userId,
      imageUrl: stored.url,
      mimeType: file.type,
      category: group.category === "custom" ? "unknown" : group.category,
      status: "processing",
    },
  });

  // 3) 同步识别（无 key / 失败则降级为人工填写）
  const ocr = await recognizeReceipt(bytes.toString("base64"), file.type);

  if (ocr.success && ocr.data) {
    const d = ocr.data;
    let receiptDate: Date | null = null;
    if (d.receiptDate) {
      const parsed = new Date(d.receiptDate);
      if (!isNaN(parsed.getTime())) receiptDate = parsed;
    }

    const updated = await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        status: "need_review",
        // custom 群保留 AI 判定的类别；预设群沿用群类别
        category:
          group.category === "custom"
            ? d.category || "unknown"
            : group.category,
        vendorName: d.vendorName || null,
        totalAmount: d.totalAmountCents ?? null,
        taxAmount: d.taxAmountCents ?? null,
        currency: d.currency || "SGD",
        receiptDate,
        ocrRawText: d.rawText || null,
        confidence: d.confidence ?? null,
        extractedJson: JSON.stringify({ candidateTags: d.candidateTags || [] }),
        items: {
          create: (d.items || []).map((it) => ({
            name: it.name,
            quantity: it.quantity ?? null,
            unitPrice: it.unitPriceCents ?? null,
            amount: it.amountCents ?? null,
          })),
        },
      },
      include: { items: true },
    });
    return NextResponse.json({ data: updated, meta: { ocr: true } });
  }

  // 降级：识别不可用，进入人工填写
  const fallback = await prisma.receipt.update({
    where: { id: receipt.id },
    data: { status: "need_review" },
    include: { items: true },
  });
  return NextResponse.json({
    data: fallback,
    meta: { ocr: false, ocrError: ocr.error },
  });
}
