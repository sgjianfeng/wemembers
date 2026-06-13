import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import { GiftSheet } from "./GiftSheet";

export default async function RedeemPage({ params }: { params: Promise<{ customerCouponId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const { customerCouponId } = await params;

  const claim = await prisma.customerCoupon.findFirst({
    where: { id: customerCouponId, customerId: session.userId },
    include: { coupon: { include: { business: { select: { businessName: true } } } } },
  });

  if (!claim) return <div className="min-h-screen flex items-center justify-center text-slate-400"><p>券不存在</p></div>;

  const daysLeft = daysUntil(claim.coupon.validUntil);
  const formattedCode = claim.qrCode.match(/.{1,4}/g)?.join(" ") || claim.qrCode;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Coupon Info */}
        <p className="text-xs text-slate-400 mb-1">{claim.coupon.business?.businessName}</p>
        <p className="text-3xl font-bold text-[#FF6B35]">¥{(claim.coupon.valueCents / 100).toFixed(0)}</p>
        <p className="text-sm text-slate-600 mt-1">{claim.coupon.title}</p>

        {/* QR Code Placeholder */}
        <div className="mt-6 w-56 h-56 bg-white border-2 border-slate-200 rounded-2xl flex items-center justify-center">
          <div className="text-center">
            <p className="text-7xl mb-2">📱</p>
            <p className="text-xs text-slate-300">[ 二维码 ]</p>
          </div>
        </div>

        {/* Code */}
        <p className="mt-4 text-2xl font-mono font-bold text-slate-900 tracking-widest">{formattedCode}</p>
        <p className="text-xs text-slate-400 mt-1">请出示给店员扫码核销</p>

        {/* Info badges */}
        <div className="flex gap-2 mt-4">
          <Badge variant={daysLeft <= 3 ? "red" : "orange"}>
            有效期至 {claim.coupon.validUntil.toLocaleDateString("zh-CN")}
          </Badge>
          <Badge variant="slate">已领{claim.pointsSpent}⭐</Badge>
        </div>

        {/* Gift info */}
        {claim.giftFromId && (
          <div className="mt-3 px-4 py-2 bg-pink-50 rounded-xl text-xs text-pink-600">
            🎁 好友赠送{claim.giftMessage ? `："${claim.giftMessage}"` : ""}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      {claim.coupon.isGiftable && claim.status === "available" && (
        <div className="px-6 pb-8 pt-4">
          <GiftSheet claimId={claim.id} couponTitle={claim.coupon.title} />
        </div>
      )}
    </div>
  );
}
