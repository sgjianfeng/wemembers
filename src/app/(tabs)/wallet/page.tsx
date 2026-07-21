import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { WalletClient } from "./WalletClient";

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const myCoupons = await prisma.customerCoupon.findMany({
    where: { customerId: session.userId },
    include: {
      coupon: {
        include: { business: { select: { businessName: true } } },
      },
    },
    orderBy: { claimedAt: "desc" },
  });

  const claims = myCoupons.map((c) => ({
    id: c.id,
    status: c.status,
    qrCode: c.qrCode,
    coupon: {
      title: c.coupon.title,
      valueCents: c.coupon.valueCents,
      validUntil: c.coupon.validUntil.toISOString(),
      businessName: c.coupon.business?.businessName || null,
    },
  }));

  return <WalletClient claims={claims} />;
}
