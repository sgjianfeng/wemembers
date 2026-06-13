import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";

export default async function CardPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const memberships = await prisma.membership.findMany({
    where: { customerId: session.userId },
    include: {
      business: {
        select: { id: true, businessName: true, businessSlug: true, businessCategory: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-slate-100">
        <h1 className="text-lg font-semibold">我的会员卡</h1>
      </div>

      {memberships.length > 0 ? (
        <div className="px-4 mt-3 space-y-2">
          {memberships.map((m) => (
            <Link
              key={m.business.id}
              href={m.business.businessSlug ? `/shop/${m.business.businessSlug}` : "#"}
            >
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white text-lg shrink-0">
                    🏢
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {m.business.businessName || "商家"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      ⭐ {m.points}积分 · {m.visitsCount}次消费
                    </p>
                  </div>
                  <span className="text-slate-300">→</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 px-6">
          <p className="text-5xl mb-4">💳</p>
          <p className="text-sm text-slate-400">还没有会员卡</p>
          <p className="text-xs text-slate-300 mt-1">去首页领取代金券即可成为商家会员</p>
          <Link
            href="/home"
            className="inline-block mt-4 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
          >
            去领券
          </Link>
        </div>
      )}
    </div>
  );
}
