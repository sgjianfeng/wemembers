// GET /api/voucher/lookup?q= — business/staff look up prepaid voucher for redeem
// Supports: full cuid, 6-char shortCode, or prefix (≥3) → candidate list
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureVoucherShortCode,
  looksLikeShortCode,
  normalizeShortCode,
} from "@/lib/voucher-short-code";

type VoucherRow = {
  id: string;
  shortCode: string | null;
  status: string;
  amountCents: number;
  balanceCents: number;
  usedCents: number;
  paidCents: number;
  tier: string;
  campaign: {
    name: string;
    slug: string | null;
    budgetPercent: number | null;
    type: string;
  } | null;
  customer: {
    displayName: string | null;
    phone: string | null;
  } | null;
};

function formatVoucher(voucher: VoucherRow) {
  const productMode: "draw" | "voucher" =
    voucher.campaign?.type === "lucky_draw_v2" ? "draw" : "voucher";
  const budgetPercent =
    productMode === "draw"
      ? voucher.campaign?.budgetPercent && voucher.campaign.budgetPercent > 0
        ? voucher.campaign.budgetPercent
        : 20
      : 0;

  return {
    id: voucher.id,
    shortCode: voucher.shortCode,
    status: voucher.status,
    amountSgd: (voucher.amountCents / 100).toFixed(2),
    balanceSgd: (voucher.balanceCents / 100).toFixed(2),
    balanceCents: voucher.balanceCents,
    usedSgd: (voucher.usedCents / 100).toFixed(2),
    paidSgd: ((voucher.paidCents || voucher.amountCents) / 100).toFixed(2),
    tier: voucher.tier,
    budgetPercent,
    productMode,
    campaignType: voucher.campaign?.type || null,
    campaignName: voucher.campaign?.name || "",
    campaignSlug: voucher.campaign?.slug || "",
    customerName: voucher.customer?.displayName || "",
    customerPhone: voucher.customer?.phone
      ? `${voucher.customer.phone.slice(0, 4)}****${voucher.customer.phone.slice(-2)}`
      : "",
  };
}

const include = {
  campaign: {
    select: {
      name: true,
      slug: true,
      budgetPercent: true,
      type: true,
    },
  },
  customer: { select: { displayName: true, phone: true } },
} as const;

async function withShortCode(v: VoucherRow): Promise<VoucherRow> {
  if (v.shortCode) return v;
  try {
    const code = await ensureVoucherShortCode(v.id);
    return { ...v, shortCode: code };
  } catch {
    return v;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "business" && session.role !== "staff")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const url = new URL(request.url);
    const raw = (url.searchParams.get("q") || url.searchParams.get("id") || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "请输入短码或券 ID" }, { status: 400 });
    }

    let q = raw;
    if (q.toLowerCase().startsWith("wmv:")) q = q.slice(4).trim();
    try {
      if (q.includes("://") || q.includes("?")) {
        const u = new URL(q, "https://local.invalid");
        const idParam = u.searchParams.get("id") || u.searchParams.get("voucherId");
        if (idParam) q = idParam;
      }
    } catch {
      /* keep */
    }

    const short = normalizeShortCode(q);

    // 1) Exact full cuid
    let voucher = await prisma.voucher.findUnique({
      where: { id: q },
      include,
    });

    // 2) Exact short code (6 chars)
    if (!voucher && (looksLikeShortCode(q) || short.length === 6)) {
      voucher = await prisma.voucher.findUnique({
        where: { shortCode: short },
        include,
      });
    }

    if (voucher) {
      voucher = await withShortCode(voucher);
      return NextResponse.json({ data: formatVoucher(voucher) });
    }

    // 3) Prefix search → candidates (min 3 chars)
    if (q.length < 3 && short.length < 3) {
      return NextResponse.json(
        { error: "请至少输入 3 位短码/ID，或扫顾客二维码" },
        { status: 400 }
      );
    }

    const idPrefix = q;
    const codePrefix = short.length >= 3 ? short : "";

    const rows = await prisma.voucher.findMany({
      where: {
        status: "active",
        balanceCents: { gt: 0 },
        OR: [
          { id: { startsWith: idPrefix } },
          ...(codePrefix
            ? [{ shortCode: { startsWith: codePrefix } }]
            : []),
          // 手机号后几位
          ...(idPrefix.length >= 4
            ? [{ customer: { phone: { contains: idPrefix } } }]
            : []),
        ],
      },
      include,
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "未找到匹配的券" }, { status: 404 });
    }

    const candidates = await Promise.all(
      rows.map(async (v) => formatVoucher(await withShortCode(v)))
    );

    if (candidates.length === 1) {
      return NextResponse.json({ data: candidates[0] });
    }

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("voucher lookup error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
