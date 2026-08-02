import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

/**
 * 权益/赠送券目录（券产品族 · 赠送线）
 * 可售卖线在「券产品」；挂到活动后在「活动券 / 活动详情」看组合
 */
export default async function CouponsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const coupons = await prisma.coupon.findMany({
    where: { businessId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });
  const sMap: Record<
    string,
    { variant: "green" | "orange" | "red" | "slate"; label: string }
  > = {
    published: {
      variant: "green",
      label: t("business.coupons.status.published", lang),
    },
    draft: { variant: "slate", label: t("business.coupons.status.draft", lang) },
    paused: {
      variant: "orange",
      label: t("business.coupons.status.paused", lang),
    },
    ended: { variant: "red", label: t("business.coupons.status.ended", lang) },
  };
  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            {t("business.coupons.title", lang)}
          </h1>
          <Link
            href="/business/coupons/new?from=coupons"
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-full shrink-0"
          >
            {t("business.coupons.create", lang)}
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          {lang === "en"
            ? "Gift / claim perks under Voucher catalog (spend & get family). Sellable SKUs are Products."
            : "满赠族赠送权益（归属券管理）。可售 SKU 在「产品」。"}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Link
            href="/business/vouchers"
            className="text-[11px] font-medium text-primary px-2.5 py-1 rounded-full bg-primary/10"
          >
            {lang === "en" ? "← Voucher catalog" : "← 券管理"}
          </Link>
          <Link
            href="/business/products"
            className="text-[11px] font-medium text-foreground px-2.5 py-1 rounded-full bg-muted"
          >
            {lang === "en" ? "Products →" : "产品 →"}
          </Link>
        </div>
      </div>
      <div className="px-4 mt-3 space-y-2">
        {coupons.map((c) => {
          const sb = sMap[c.status] || {
            variant: "slate" as const,
            label: c.status,
          };
          const detailHref = c.campaignId
            ? `/business/coupons/${c.id}?from=campaign&campaignId=${c.campaignId}`
            : `/business/coupons/${c.id}?from=coupons`;
          return (
            <Link key={c.id} href={detailHref}>
              <Card className="hover:border-primary/30">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        {lang === "en" ? "Gift" : "赠送"}
                      </span>
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.title}
                      </p>
                      <Badge variant={sb.variant} size="sm">
                        {sb.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 nums">
                      S${(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ ·{" "}
                      {lang === "zh" ? "领取" : "Claimed"}
                      {c.claimedCount}/{c.totalQuantity || "∞"}
                      {c.campaign ? (
                        <span className="text-foreground/70">
                          {" "}
                          · {c.campaign.name}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0">→</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {coupons.length === 0 && (
          <div className="text-center py-12 text-muted-foreground px-2">
            <p className="text-3xl mb-2">🎫</p>
            <p className="text-sm">{t("business.coupons.noCoupons", lang)}</p>
            <p className="text-xs mt-2 leading-relaxed max-w-xs mx-auto">
              {lang === "en"
                ? "Need sellable store cards or exclusive draws? Use Products. For National Day gifts, create here then link in an Activity."
                : "要卖 9 折卡、独享抽奖 → 去「券产品」。国庆赠送券可在此创建后挂到「活动」。"}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Link
                href="/business/products"
                className="inline-block px-4 py-2 text-xs font-medium rounded-full bg-primary text-primary-foreground"
              >
                {lang === "en" ? "Go to Products" : "去券产品"}
              </Link>
              <Link
                href="/business/coupons/new?from=coupons"
                className="inline-block px-4 py-2 text-xs font-medium rounded-full border border-border"
              >
                {lang === "en" ? "Create gift coupon" : "创建赠送券"}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
