import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // 只列「活动」容器；product_mirror 是购券兼容镜像，归在「券产品」
  const campaigns = await prisma.campaign.findMany({
    where: {
      businessId: session.userId,
      role: { not: "product_mirror" },
    },
    include: {
      coupons: { select: { id: true } },
      catalogProducts: {
        include: {
          product: { select: { id: true, name: true, status: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const typeLabels: Record<string, { zh: string; en: string; icon: string }> = {
    promotion: { zh: "促销", en: "Promotion", icon: "🏷️" },
    seasonal: { zh: "季节", en: "Seasonal", icon: "🌸" },
    holiday: { zh: "节日", en: "Holiday", icon: "🎉" },
    event: { zh: "活动", en: "Event", icon: "📅" },
    launch: { zh: "新品", en: "Launch", icon: "🚀" },
    lucky_draw: { zh: "抽奖", en: "Lucky draw", icon: "🎰" },
    lucky_draw_v2: { zh: "抽奖券", en: "Draw voucher", icon: "🎰" },
    voucher_sale: { zh: "代金券", en: "Voucher", icon: "🏷️" },
  };

  const statusBadge: Record<string, { variant: "green" | "orange" | "slate"; zh: string; en: string }> = {
    draft: { variant: "slate", zh: "草稿", en: "Draft" },
    active: { variant: "green", zh: "进行中", en: "Active" },
    ended: { variant: "orange", zh: "已结束", en: "Ended" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t("business.campaigns.title", lang)}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("business.campaigns.subtitle", lang)}</p>
        </div>
        <Link href="/business/campaigns/new" className="shrink-0 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-full">
          + {t("business.campaigns.create", lang)}
        </Link>
      </div>

      <div className="px-4 mt-3">
        <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {lang === "en" ? (
            <>
              <span className="font-medium text-foreground">Flow: </span>
              Templates →{" "}
              <Link href="/business/products" className="text-primary font-medium">
                Products
              </Link>{" "}
              (what you sell) → this page (pick products + which stores join).
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">怎么用：</span>
              先在{" "}
              <Link href="/business/products" className="text-primary font-medium">
                券产品
              </Link>{" "}
              上架要卖的线，再在这里勾选产品、让门店参与。活动本身不直接定价。
            </>
          )}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {campaigns.map((c) => {
          const ti = typeLabels[c.type] || typeLabels.promotion;
          const sb = statusBadge[c.status] || statusBadge.draft;
          const now = new Date();
          const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / 86400000);
          const productNames = c.catalogProducts
            .map((x) => x.product.name)
            .filter(Boolean);
          const productCount = productNames.length;

          return (
            <Link key={c.id} href={`/business/campaigns/${c.id}`}>
              <Card className="hover:border-primary/30 transition-colors border-l-4" style={{ borderLeftColor: c.color || "#1A6EFF" }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{ti.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ti[lang]}
                          {" · "}
                          <span
                            className={
                              c.productKind === "self_use"
                                ? "text-muted-foreground font-medium"
                                : "text-amber-700 dark:text-amber-400 font-medium"
                            }
                          >
                            {c.type === "lucky_draw_v2" || c.type === "lucky_draw"
                              ? c.productKind === "self_use"
                                ? lang === "en"
                                  ? "Exclusive draw"
                                  : "独享券"
                                : lang === "en"
                                  ? "Co-win draw"
                                  : "共赢券"
                              : c.productKind === "self_use"
                                ? lang === "en"
                                  ? "Self-use"
                                  : "自用券"
                                : lang === "en"
                                  ? "Distribution"
                                  : "分发券"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <Badge variant={sb.variant}>{sb[lang]}</Badge>
                  </div>

                  <p className="text-[11px] text-foreground/80 mb-2 line-clamp-2">
                    {productCount > 0 ? (
                      <>
                        <span className="text-muted-foreground">
                          {lang === "en" ? "Products: " : "含产品："}
                        </span>
                        {productNames.join(" · ")}
                      </>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">
                        {lang === "en"
                          ? "No products linked — open to pick catalog products"
                          : "未挂券产品 — 点进勾选「券产品」"}
                      </span>
                    )}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">{productCount}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {lang === "en" ? "Products" : "券产品"}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">{c.totalClaims}</p>
                      <p className="text-[10px] text-muted-foreground">{t("business.campaigns.claimed", lang)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg py-2">
                      <p className="text-lg font-bold text-foreground">{c.totalRedemptions}</p>
                      <p className="text-[10px] text-muted-foreground">{t("business.campaigns.redeemed", lang)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>{c.startDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")} ~ {c.endDate.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}</span>
                    {c.status === "active" && daysLeft > 0 && <span className="text-amber-500">{t("business.campaigns.daysLeft", lang, { days: daysLeft })}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {campaigns.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-sm">{t("business.campaigns.noCampaigns", lang)}</p>
            <p className="text-xs mt-1">{t("business.campaigns.noCampaignsHint", lang)}</p>
            <Link
              href="/business/products"
              className="inline-flex mt-4 text-xs font-medium text-primary"
            >
              {lang === "en" ? "Create products first →" : "先去创建券产品 →"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
