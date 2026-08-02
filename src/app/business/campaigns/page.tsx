import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import {
  CampaignsClient,
  type CampaignListItem,
} from "./CampaignsClient";

function isArchivedCleanup(tags: string | null | undefined): boolean {
  if (!tags) return false;
  try {
    const arr = JSON.parse(tags) as unknown;
    if (!Array.isArray(arr)) return /archived_cleanup|merged_to_long_term/.test(tags);
    return arr.some(
      (x) => x === "archived_cleanup" || x === "merged_to_long_term"
    );
  } catch {
    return /archived_cleanup|merged_to_long_term/.test(tags);
  }
}

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  // 只列「活动」容器；product_mirror 是购券兼容镜像，归在「券产品」
  const campaignsRaw = await prisma.campaign.findMany({
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

  // 已合并进长期券的旧活动不占列表
  const campaigns = campaignsRaw.filter((c) => !isArchivedCleanup(c.tags));

  const items: CampaignListItem[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    productKind: c.productKind,
    color: c.color,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    totalClaims: c.totalClaims,
    totalRedemptions: c.totalRedemptions,
    productNames: c.catalogProducts
      .map((x) => x.product.name)
      .filter(Boolean),
  }));

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">
            {t("business.campaigns.title", lang)}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("business.campaigns.subtitle", lang)}
          </p>
        </div>
        <Link
          href="/business/campaigns/new"
          className="shrink-0 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-full"
        >
          + {t("business.campaigns.create", lang)}
        </Link>
      </div>

      <div className="px-4 mt-3">
        <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {lang === "en" ? (
            <>
              <span className="font-medium text-foreground">Three areas: </span>
              <Link
                href="/business/vouchers"
                className="text-primary font-medium"
              >
                Voucher catalog
              </Link>{" "}
              (templates + products) →{" "}
              <span className="font-medium text-foreground">Activities</span>{" "}
              (this page) →{" "}
              <Link href="/business/offers" className="text-primary font-medium">
                Offers
              </Link>{" "}
              (store day-to-day, tab bar).
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">三大块：</span>
              <Link
                href="/business/vouchers"
                className="text-primary font-medium"
              >
                券管理
              </Link>
              （模版+产品）→{" "}
              <span className="font-medium text-foreground">活动管理</span>
              （本页）→{" "}
              <Link href="/business/offers" className="text-primary font-medium">
                活动券
              </Link>
              （底栏日常，不动）。
            </>
          )}
        </div>
      </div>

      <div className="px-4 mt-4">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-4xl mb-2">📅</p>
            <p className="text-sm">
              {t("business.campaigns.noCampaigns", lang)}
            </p>
            <p className="text-xs mt-1">
              {t("business.campaigns.noCampaignsHint", lang)}
            </p>
            <Link
              href="/business/vouchers"
              className="inline-flex mt-4 text-xs font-medium text-primary"
            >
              {lang === "en" ? "Voucher catalog first →" : "先去券管理 →"}
            </Link>
          </div>
        ) : (
          <CampaignsClient lang={lang} items={items} />
        )}
      </div>
    </div>
  );
}
