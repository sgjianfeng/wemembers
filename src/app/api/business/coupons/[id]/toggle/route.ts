import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST to toggle coupon status
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "business") return NextResponse.json({ error: "403" }, { status: 403 });

  const { id } = await params;
  const coupon = await prisma.coupon.findFirst({ where: { id, businessId: session.userId } });
  if (!coupon) return NextResponse.json({ error: "404" }, { status: 404 });

  const newStatus = coupon.status === "published" ? "paused" : "published";
  await prisma.coupon.update({ where: { id }, data: { status: newStatus } });

  return NextResponse.redirect(new URL(`/business/coupons/${id}`, request.url));
}
