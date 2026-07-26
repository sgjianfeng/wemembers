import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

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

  if (!business) {
    return (
      <EmptyState
        tone="calm"
        icon="stores"
        title="商家不存在"
        description="该商家可能已被删除，或链接有误"
        className="min-h-screen justify-center"
      />
    );
  }

  const [memberCount, couponCount, claimCount, redeemCount] = stats;
  const transactions = business.tokenAccount?.transactions || [];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">{business.businessName || "未命名"}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{business.email} · {business.businessCategory || "未分类"}</p>
      </div>
      <div className="px-4 mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[{ l: "会员数", v: memberCount }, { l: "代金券", v: couponCount }, { l: "领取数", v: claimCount }, { l: "核销数", v: redeemCount }].map(s => (
            <Card key={s.l} className="bg-muted/50 border-0"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-foreground nums">{s.v}</p><p className="text-[10px] text-muted-foreground">{s.l}</p></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Token</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 nums">
              <Coins size={16} /> {business.tokenAccount?.balance.toLocaleString() ?? 0}
            </span>
          </div>
        </CardContent></Card>
        <h3 className="text-sm font-semibold text-foreground">近期Token记录</h3>
        {transactions.length === 0 ? (
          <EmptyState tone="calm" icon="tokens" title="暂无Token记录" description="该商家还没有Token流水" className="py-8" />
        ) : (
          <div className="space-y-1">
            {transactions.map(tx => (
              <div key={tx.id} className="flex justify-between px-3 py-2 bg-card rounded-lg border border-border text-xs">
                <span className="text-muted-foreground truncate">{tx.description}</span>
                <span className={cn("nums", tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>{tx.amount > 0 ? "+" : ""}{tx.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
