import { getSession } from "@/lib/auth"; import { redirect } from "next/navigation"; import { prisma } from "@/lib/db"; import { Card, CardContent } from "@/components/ui/Card"; import { Badge } from "@/components/ui/Badge"; import Link from "next/link"; import { cookies } from "next/headers"; import { t } from "@/lib/i18n";

export default async function CouponsPage() {
  const session = await getSession(); if (!session || session.role !== "business") redirect("/auth/login");
  const c = await cookies(); const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const coupons = await prisma.coupon.findMany({ where: { businessId: session.userId }, orderBy: { createdAt: "desc" }, take: 50 });
  const sMap: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = { published: { variant: "green", label: t("business.coupons.status.published", lang) }, draft: { variant: "slate", label: t("business.coupons.status.draft", lang) }, paused: { variant: "orange", label: t("business.coupons.status.paused", lang) }, ended: { variant: "red", label: t("business.coupons.status.ended", lang) } };
  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><h1 className="text-lg font-semibold">{t("business.coupons.title", lang)}</h1><Link href="/business/coupons/new" className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">{t("business.coupons.create", lang)}</Link></div>
      <div className="px-4 mt-3 space-y-2">
        {coupons.map((c) => { const sb = sMap[c.status] || { variant: "slate" as const, label: c.status }; return (
          <Link key={c.id} href={`/business/coupons/${c.id}`}><Card className="hover:border-[#1A6EFF]/30"><CardContent className="p-3 flex items-center justify-between"><div><div className="flex items-center gap-2"><p className="text-sm font-medium text-slate-900">{c.title}</p><Badge variant={sb.variant} size="sm">{sb.label}</Badge></div><p className="text-xs text-slate-400 mt-1">¥{(c.valueCents / 100).toFixed(0)} · {c.pointsRequired}⭐ · {lang === "zh" ? "领取" : "Claimed"}{c.claimedCount}/{c.totalQuantity || "∞"}</p></div><span className="text-slate-300">→</span></CardContent></Card></Link>
        );})}
        {coupons.length === 0 && <div className="text-center py-12 text-slate-400"><p className="text-3xl mb-2">🎫</p><p className="text-sm">{t("business.coupons.noCoupons", lang)}</p></div>}
      </div>
    </div>
  );
}
