// POST /api/business/promo/ndp/receipt-ocr
// 满赠台：拍小票 → 识别金额 + 单号后四位（不入库，仅回填表单）
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recognizeReceipt } from "@/services/ai/vision";
import { enrichReceiptFields } from "@/lib/receipt-parse";

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传小票图片" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type) && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "仅支持 JPG/PNG/WebP/HEIC 图片" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "图片不能超过 10MB" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const ocr = await recognizeReceipt(bytes.toString("base64"), mime, {
      timeout: 35000,
    });

    if (!ocr.success || !ocr.data) {
      return NextResponse.json({
        data: {
          ocrOk: false,
          amountCents: null,
          amountSgd: "",
          receiptNumber: "",
          receiptLast4: "",
          confidence: null,
          message:
            ocr.error ||
            "未能自动识别，请核对小票上的金额与单号后四位后手动填写",
        },
      });
    }

    const d = ocr.data;
    const enriched = enrichReceiptFields({
      totalAmountCents: d.totalAmountCents,
      receiptNumber: d.receiptNumber,
      receiptLast4: d.receiptLast4,
      rawText: d.rawText,
    });

    return NextResponse.json({
      data: {
        ocrOk: true,
        amountCents: enriched.amountCents,
        amountSgd: enriched.amountSgd,
        receiptNumber: enriched.receiptNumber,
        receiptLast4: enriched.receiptLast4,
        currency: d.currency || "SGD",
        confidence: d.confidence ?? null,
        category: d.category,
        message:
          enriched.amountCents || enriched.receiptLast4
            ? "已识别，请核对金额与单号后四位后再发放"
            : "已识别图片，但金额/单号不清晰，请手动填写",
      },
    });
  } catch (e) {
    console.error("ndp receipt-ocr", e);
    return NextResponse.json({ error: "识别失败，请手动填写" }, { status: 500 });
  }
}
