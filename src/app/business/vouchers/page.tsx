import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import {
  BadgePercent,
  Gift,
  Trophy,
  Package,
  ChevronRight,
  Settings2,
  Ticket,
} from "lucide-react";

function packKindFromRules(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { packKind?: string };
    return o.packKind || null;
  } catch {
    return null;
  }
}

/**
 * 券管理：模版（3 大类）+ 产品实例
 * 与「活动管理」「活动券」并列；日常门店操作仍走底栏活动券（不改）
 */
export default async function BusinessVouchersHubPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const zh = lang !== "en";

  const products = await prisma.voucherProduct.findMany({
    where: { businessId: session.userId, status: { not: "archived" } },
    select: {
      id: true,
      name: true,
      status: true,
      slug: true,
      type: true,
      rulesSnapshot: true,
      _count: { select: { vouchers: true, campaignLinks: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const giftCount = await prisma.coupon.count({
    where: { businessId: session.userId },
  });

  const activeProducts = products.filter((p) => p.status === "active").length;
  const draftProducts = products.filter((p) => p.status === "draft").length;

  const templates = [
    {
      key: "spend_get",
      icon: Gift,
      nameZh: "满赠模版",
      nameEn: "Spend & get",
      descZh: "满额送赠送券（如满120送61）· 活动权益，不单独当货架 SKU",
      descEn: "Min spend → gift coupon · campaign perk, not a shelf SKU",
      color: "text-rose-600 bg-rose-500/10 border-rose-500/25",
      primaryHref: "/business/ndp-issue",
      primaryLabelZh: "配置国庆满赠",
      primaryLabelEn: "Setup NDP gift",
      secondaryHref: "/business/coupons",
      secondaryLabelZh: "赠送券目录",
      secondaryLabelEn: "Gift catalog",
    },
    {
      key: "discount",
      icon: BadgePercent,
      nameZh: "折扣 / 预付券",
      nameEn: "Discount / prepaid",
      descZh: "原价 · 门槛 · 9折卡 · 同一族参数（折扣%、门槛、档位）",
      descEn: "Face · threshold · 10% off · one family (discount, min spend, tiers)",
      color: "text-[#1A6EFF] bg-[#1A6EFF]/10 border-[#1A6EFF]/25",
      primaryHref: "/business/products?family=prepaid",
      primaryLabelZh: "管理 / 新建产品",
      primaryLabelEn: "Manage products",
      secondaryHref: "/business/templates",
      secondaryLabelZh: "调费率规则",
      secondaryLabelEn: "Fee rules",
    },
    {
      key: "exclusive",
      icon: Trophy,
      nameZh: "独享倒计时大奖",
      nameEn: "Exclusive countdown",
      descZh: "购券进奖池 · 15% 拆分 · 可入箱票 · 热门展示",
      descEn: "Buy into pool · 15% split · ballot · hot feed",
      color: "text-violet-600 bg-violet-500/10 border-violet-500/25",
      primaryHref: "/business/products?family=exclusive",
      primaryLabelZh: "管理 / 新建产品",
      primaryLabelEn: "Manage products",
      secondaryHref: "/business/templates",
      secondaryLabelZh: "调费率规则",
      secondaryLabelEn: "Fee rules",
    },
  ] as const;

  function familyOf(p: (typeof products)[0]): "prepaid" | "exclusive" | "other" {
    const pack = packKindFromRules(p.rulesSnapshot);
    if (
      pack === "exclusive_ballot" ||
      p.type === "lucky_draw_v2" ||
      p.type === "lucky_draw"
    ) {
      return "exclusive";
    }
    if (
      pack === "face_open" ||
      pack === "face_threshold" ||
      pack === "discount_10" ||
      p.type === "voucher_sale"
    ) {
      return "prepaid";
    }
    return "other";
  }

  return (
    <div className="pb-8">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">
          {zh ? "券管理" : "Voucher catalog"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {zh
            ? "模版（3 大类机制）→ 产品（本店 SKU）。上架后挂到活动，日常在「活动券」操作。"
            : "Templates (3 mechanisms) → products (your SKUs). Link into activities; day-to-day on Offers."}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Link
            href="/business/campaigns"
            className="text-[11px] font-medium text-foreground px-2.5 py-1 rounded-full bg-muted"
          >
            {zh ? "活动管理 →" : "Activities →"}
          </Link>
          <Link
            href="/business/offers"
            className="text-[11px] font-medium text-primary px-2.5 py-1 rounded-full bg-primary/10"
          >
            {zh ? "活动券 →" : "Offers →"}
          </Link>
        </div>
      </div>

      <div className="px-4 mt-3">
        <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5 text-[11px] text-muted-foreground leading-relaxed">
          {zh ? (
            <>
              <span className="font-medium text-foreground">三大块：</span>
              <strong className="text-foreground">券管理</strong>
              （本页）·{" "}
              <strong className="text-foreground">活动管理</strong>
              ·{" "}
              <strong className="text-foreground">活动券</strong>
              （底栏，门店日常）
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Three areas: </span>
              Catalog · Activities · Offers (tab bar)
            </>
          )}
        </div>
      </div>

      {/* 模版 3 大类 */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-foreground">
            {zh ? "模版 · 三大类" : "Templates · 3 kinds"}
          </h2>
          <Link
            href="/business/templates"
            className="text-[11px] font-medium text-primary inline-flex items-center gap-0.5"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {zh ? "规则微调" : "Fine-tune"}
          </Link>
        </div>
        <div className="space-y-2.5">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <Card
                key={tpl.key}
                className={`border overflow-hidden ${tpl.color.split(" ").filter((x) => x.startsWith("border-")).join(" ")}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tpl.color}`}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {zh ? tpl.nameZh : tpl.nameEn}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {zh ? tpl.descZh : tpl.descEn}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        <Link
                          href={tpl.primaryHref}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-foreground text-background"
                        >
                          {zh ? tpl.primaryLabelZh : tpl.primaryLabelEn}
                        </Link>
                        <Link
                          href={tpl.secondaryHref}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-card text-foreground"
                        >
                          {zh ? tpl.secondaryLabelZh : tpl.secondaryLabelEn}
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 产品实例 */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
              <Package className="w-4 h-4 text-muted-foreground" />
              {zh ? "产品 · 本店 SKU" : "Products · your SKUs"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {zh
                ? `在售 ${activeProducts} · 草稿 ${draftProducts} · 赠送权益 ${giftCount}`
                : `${activeProducts} live · ${draftProducts} draft · ${giftCount} gift perks`}
            </p>
          </div>
          <Link
            href="/business/products"
            className="text-[11px] font-semibold text-primary shrink-0"
          >
            {zh ? "全部产品 →" : "All →"}
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {zh ? "还没有可售产品" : "No sellable products yet"}
            </p>
            <Link
              href="/business/products"
              className="inline-block mt-2 text-sm font-semibold text-primary"
            >
              {zh ? "从模版创建 →" : "Create from template →"}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {products.slice(0, 8).map((p) => {
              const fam = familyOf(p);
              const famLabel =
                fam === "exclusive"
                  ? zh
                    ? "独享大奖"
                    : "Exclusive"
                  : fam === "prepaid"
                    ? zh
                      ? "折扣/预付"
                      : "Prepaid"
                    : zh
                      ? "其它"
                      : "Other";
              return (
                <Link key={p.id} href={`/business/products/${p.id}`}>
                  <Card className="hover:border-primary/30 transition-colors active:scale-[0.99]">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {p.name}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {famLabel}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              p.status === "active"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {p.status === "active"
                              ? zh
                                ? "在售"
                                : "Live"
                              : p.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {p.slug ? `/voucher/${p.slug}` : p.type}
                          {" · "}
                          {zh ? "售" : "sold"} {p._count.vouchers}
                          {" · "}
                          {zh ? "活动" : "acts"} {p._count.campaignLinks}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            {products.length > 8 && (
              <Link
                href="/business/products"
                className="block text-center text-xs font-semibold text-primary py-2"
              >
                {zh
                  ? `查看全部 ${products.length} 个产品 →`
                  : `All ${products.length} products →`}
              </Link>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/business/coupons"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-full border border-border bg-card"
          >
            <Ticket className="w-3.5 h-3.5" />
            {zh ? "赠送券目录" : "Gift catalog"}
            {giftCount > 0 ? ` (${giftCount})` : ""}
          </Link>
          <Link
            href="/business/products"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-full border border-border bg-card"
          >
            <Package className="w-3.5 h-3.5" />
            {zh ? "新建可售产品" : "New product"}
          </Link>
        </div>
      </div>
    </div>
  );
}
