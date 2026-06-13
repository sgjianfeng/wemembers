import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import { SERVICE_CATEGORIES } from "@/types";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const business = await prisma.user.findFirst({
    where: { businessSlug: slug, role: "business", status: "active" },
    select: {
      id: true,
      businessName: true,
      businessLogo: true,
      businessCategory: true,
      businessSlug: true,
    },
  });

  if (!business) notFound();

  const session = await getSession();
  const isLoggedIn = !!session;

  const coupons = await prisma.coupon.findMany({
    where: {
      businessId: business.id,
      status: "published",
      validUntil: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const categoryLabel = SERVICE_CATEGORIES.find((c) => c.value === business.businessCategory)?.label;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Business Header */}
      <div className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] px-4 pt-8 pb-8 text-white">
        <div className="text-center">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto text-3xl">
            🏢
          </div>
          <h1 className="text-xl font-bold mt-3">{business.businessName}</h1>
          {categoryLabel && (
            <Badge variant="slate" size="md" className="!bg-white/20 !text-white mt-2">
              {categoryLabel}
            </Badge>
          )}
        </div>
      </div>

      {/* Coupons Section */}
      <div className="px-4 -mt-4 pb-8">
        <div className="bg-white rounded-t-2xl pt-5 px-1">
          <div className="flex items-center justify-between px-3 mb-3">
            <h2 className="text-base font-semibold text-slate-900">
              🎫 可领取代金券
            </h2>
            <span className="text-xs text-slate-400">{coupons.length}张</span>
          </div>

          {coupons.length > 0 ? (
            <div className="space-y-2 px-3">
              {coupons.map((c) => {
                const daysLeft = daysUntil(c.validUntil);
                const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
                const typeLabel = { fixed_amount: "定额减免", percentage: "折扣券", free_item: "免单券" }[c.type] || c.type;
                const displayValue = c.type === "percentage"
                  ? `${(c.valueCents / 100).toFixed(0)}折`
                  : c.type === "free_item"
                  ? "免单"
                  : `¥${(c.valueCents / 100).toFixed(0)}`;

                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card className={`hover:border-[#1A6EFF]/30 transition-colors border-l-4 border-l-[#FF6B35] ${soldOut ? "opacity-50" : ""}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-base font-bold text-[#FF6B35]">{displayValue}</p>
                              <Badge variant="slate" size="sm">{typeLabel}</Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-900 mt-1">{c.title}</p>
                            {c.description && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{c.description}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <span className="text-xs text-slate-400">
                              {soldOut ? "已领完" : `${c.pointsRequired}⭐`}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {daysLeft > 0 ? `${daysLeft}天后到期` : "即将到期"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-dashed border-slate-50 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            剩余 {c.remainingQuantity ?? "∞"} 张
                          </span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span className="text-[10px] text-slate-400">
                            已领 {c.claimedCount} 次
                          </span>
                          {!soldOut && (
                            <span className="ml-auto inline-block px-2 py-0.5 bg-[#1A6EFF] text-white text-[10px] rounded-full">
                              领取
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <p className="text-4xl mb-3">🎫</p>
              <p className="text-sm text-slate-400">该商家暂未发布代金券</p>
              <p className="text-xs text-slate-300 mt-1">请稍后再来</p>
            </div>
          )}
        </div>

        {/* Login Prompt */}
        {!isLoggedIn && coupons.length > 0 && (
          <div className="mx-3 mt-4 p-4 bg-[#1A6EFF]/5 rounded-xl border border-[#1A6EFF]/10 text-center">
            <p className="text-sm text-slate-600">
              选择代金券领取时需要登录
            </p>
            <Link
              href={`/auth/login?redirect=/shop/${business.businessSlug}`}
              className="inline-block mt-2 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
            >
              立即登录
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6 pb-4">
          <p className="text-[10px] text-slate-300">Powered by WeMembers</p>
        </div>
      </div>
    </div>
  );
}
