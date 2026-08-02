import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { Badge } from "@/components/ui/Badge";
import { TopHeader } from "@/components/ui/TopHeader";
import { daysUntil } from "@/lib/utils";
import { generateQrCodeSvg } from "@/lib/qr";
import { GiftSheet } from "./GiftSheet";

export default async function RedeemPage({
  params,
}: {
  params: Promise<{ customerCouponId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const { customerCouponId } = await params;

  const claim = await prisma.customerCoupon.findFirst({
    where: { id: customerCouponId, customerId: session.userId },
    include: {
      coupon: { include: { business: { select: { businessName: true } } } },
    },
  });

  if (!claim) {
    return (
      <div className="min-h-screen flex flex-col bg-card">
        <TopHeader fallbackUrl="/wallet" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>{t("redeem.notFound", lang)}</p>
        </div>
      </div>
    );
  }

  // 单张券到期（国庆满赠等）优先于模版 validUntil
  const validUntil = claim.expiresAt ?? claim.coupon.validUntil;
  const daysLeft = daysUntil(validUntil);
  const formattedCode =
    claim.qrCode.match(/.{1,4}/g)?.join(" ") || claim.qrCode;
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  // 核销台按 qrCode 精确查找；码内容即核销码（去空格）
  const qrPayload = claim.qrCode.replace(/\s+/g, "").toUpperCase();
  let qrSvg = "";
  try {
    qrSvg = await generateQrCodeSvg(qrPayload, 220);
  } catch {
    qrSvg = "";
  }

  const isUsed = claim.status === "used";
  const isExpired =
    claim.status === "expired" || validUntil.getTime() < Date.now();

  return (
    <div className="min-h-screen flex flex-col bg-card">
      <TopHeader fallbackUrl="/wallet" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <p className="text-xs text-muted-foreground mb-1">
          {claim.coupon.business?.businessName}
        </p>
        <p className="text-3xl font-bold text-[#FF6B35]">
          S${(claim.coupon.valueCents / 100).toFixed(0)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{claim.coupon.title}</p>

        {isUsed || isExpired ? (
          <div className="mt-6 w-56 h-56 bg-muted/40 border-2 border-border rounded-2xl flex items-center justify-center">
            <p className="text-sm font-semibold text-muted-foreground">
              {isUsed
                ? lang === "en"
                  ? "Already used"
                  : "已使用"
                : lang === "en"
                  ? "Expired"
                  : "已过期"}
            </p>
          </div>
        ) : (
          <div className="mt-6 w-56 h-56 bg-white border-2 border-border rounded-2xl flex items-center justify-center p-3 shadow-sm">
            {qrSvg ? (
              <div
                className="w-full h-full [&_svg]:w-full [&_svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <p className="text-xs text-muted-foreground text-center px-2">
                {lang === "en"
                  ? "Show the code below to staff"
                  : "请出示下方核销码给店员"}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-2xl font-mono font-bold text-foreground tracking-widest">
          {formattedCode}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("redeem.presentToStaff", lang)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-xs leading-relaxed">
          {lang === "en"
            ? "Staff: open Scan → Online, scan this QR or type the code"
            : "店员：核销台 → 线上券，扫此码或输入核销码"}
        </p>

        <div className="flex gap-2 mt-4 flex-wrap justify-center">
          <Badge variant={daysLeft <= 3 ? "red" : "orange"}>
            {t("redeem.validUntil", lang, {
              date: validUntil.toLocaleDateString(dateLocale),
            })}
          </Badge>
          <Badge variant="slate">
            {t("redeem.claimed", lang, { points: claim.pointsSpent })}
          </Badge>
          {claim.status === "available" && !isExpired && (
            <Badge variant="green">
              {lang === "en" ? "Ready" : "可核销"}
            </Badge>
          )}
        </div>

        {claim.giftFromId && (
          <div className="mt-3 px-4 py-2 bg-pink-50 rounded-xl text-xs text-pink-600">
            🎁 {t("redeem.giftFrom", lang)}
            {claim.giftMessage ? `："${claim.giftMessage}"` : ""}
          </div>
        )}
      </div>

      {claim.coupon.isGiftable && claim.status === "available" && !isExpired && (
        <div className="px-6 pb-8 pt-4">
          <GiftSheet claimId={claim.id} couponTitle={claim.coupon.title} />
        </div>
      )}
    </div>
  );
}
