import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";

export default async function AdminBizDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  const { id } = await params;

  const [business, stats] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { tokenAccount: { include: { transactions: { take: 10, orderBy: { createdAt: "desc" } } } } },
    }),
    Promise.all([
      prisma.membership.count({ where: { businessId: id } }),
      prisma.coupon.count({ where: { businessId: id } }),
      prisma.customerCoupon.count({ where: { coupon: { businessId: id } } }),
      prisma.redemptionLog.count({ where: { businessId: id } }),
    ]),
  ]);

  if (!business) return <div className="p-8 text-center text-slate-400">商家不存在</div>;

  const [memberCount, couponCount, claimCount, redeemCount] = stats;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{business.businessName || "未命名"}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{business.email} · {business.businessCategory || "未分类"}</p>
      </div>
      <div className="px-4 mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[{ l: "会员数", v: memberCount }, { l: "代金券", v: couponCount }, { l: "领取数", v: claimCount }, { l: "核销数", v: redeemCount }].map(s => (
            <Card key={s.l} className="bg-slate-50 border-0"><CardContent className="p-3 text-center"><p className="text-xl font-bold">{s.v}</p><p className="text-[10px] text-slate-400">{s.l}</p></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">Token</span><span className="text-lg font-bold text-amber-600">🪙 {business.tokenAccount?.balance.toLocaleString() ?? 0}</span></div>
        </CardContent></Card>
        <h3 className="text-sm font-semibold">近期Token记录</h3>
        <div className="space-y-1">
          {(business.tokenAccount?.transactions || []).map(tx => (
            <div key={tx.id} className="flex justify-between px-3 py-2 bg-white rounded-lg border border-slate-50 text-xs">
              <span className="text-slate-600 truncate">{tx.description}</span>
              <span className={tx.amount > 0 ? "text-green-600" : "text-slate-500"}>{tx.amount > 0 ? "+" : ""}{tx.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
