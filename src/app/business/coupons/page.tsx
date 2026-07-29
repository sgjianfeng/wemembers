import { getSession } from "@/lib/auth"; import { redirect } from "next/navigation"; import { prisma } from "@/lib/db"; import { Card, CardContent } from "@/components/ui/Card"; import { Badge } from "@/components/ui/Badge"; import Link from "next/link"; import { cookies } from "next/headers"; import { t } from "@/lib/i18n";

export default async function CouponsPage() {
  const session = await getSession(); if (!session || session.role !== "business") redirect("/auth/login");
  const c = await cookies(); const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const coupons = await prisma.coupon.findMany({ where: { businessId: session.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  const sMap: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = { published: { variant: "green", label: t("business.coupons.status.published", lang) }, draft: { variant: "slate", label: t("business.coupons.status.draft", lang) }, paused: { variant: "orange", label: t("business.coupons.status.paused", lang) }, ended: { variant: "red", label: t("business.coupons.status.ended", lang) } };
  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{t("business.coupons.title", lang)}</h1>
          <Link
            href="/business/coupons/new"
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-full shrink-0"
          >
            {t("business.coupons.create", lang)}
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          {lang === "en"
            ? "Free claim / points coupons for promotion — not the same as sellable Products."
            : "积分领取、营销送券用。可售卖的 9 折卡 / 独享券等请用「券产品」。"}
        </p>
      </div>
      <div className="px-4 mt-3 space-y-2">
        {coupons.map((c) => { const sb = sMap[c.status] || { variant: "slate" as const, label: c.status }; return (
          <Link key={c.id} href={`/business/coupons/${c.id}`}><Card className="hover:border-primary/30"><CardContent className="p-3 flex items-center justify-between"><div><div className="flex items-center gap-2"><p className="text-sm font-medium text-foreground">{c.title}</p><Badge variant={sb.variant} size="sm">{sb.label}</Badge></div><p className="text-xs text-muted-foreground mt-1">S${(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ · {lang === "zh" ? "领取" : "Claimed"}{c.claimedCount}/{c.totalQuantity || "∞"}</p></div><span className="text-muted-foreground">→</span></CardContent></Card></Link>
        );})}
        {coupons.length === 0 && (
          <div className="text-center py-12 text-muted-foreground px-2">
            <p className="text-3xl mb-2">🎫</p>
            <p className="text-sm">{t("business.coupons.noCoupons", lang)}</p>
            <p className="text-xs mt-2 leading-relaxed max-w-xs mx-auto">
              {lang === "en"
                ? "Need sellable store cards or exclusive draws? Use Products instead."
                : "要卖 9 折卡、独享 15% 等可售卖线 → 去「券产品」。"}
            </p>
            <Link
              href="/business/products"
              className="inline-block mt-4 px-4 py-2 text-xs font-medium rounded-full bg-primary text-primary-foreground"
            >
              {lang === "en" ? "Go to Products" : "去券产品"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
