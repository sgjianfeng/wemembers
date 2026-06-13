import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TOKEN_PACKAGES } from "@/types";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

export default async function TokenRechargePage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      tokenAccount: {
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } },
      },
    },
  });

  const balance = user?.tokenAccount?.balance ?? 0;
  const transactions = user?.tokenAccount?.transactions ?? [];

  const consumeTypeLabels: Record<string, { label: string; color: string }> = {
    purchase: { label: "购买", color: "text-green-600" },
    free_grant: { label: "赠送", color: "text-blue-600" },
    signup_bonus: { label: "注册奖励", color: "text-blue-600" },
    referral_bonus: { label: "推荐奖励", color: "text-blue-600" },
    admin_adjust: { label: "管理员调整", color: "text-purple-600" },
    coupon_create: { label: "创建代金券", color: "text-orange-600" },
    sms_notify: { label: "短信通知", color: "text-orange-600" },
    email_notify: { label: "邮件通知", color: "text-orange-600" },
    redeem_verify: { label: "核销验证", color: "text-orange-600" },
    member_add: { label: "添加会员", color: "text-orange-600" },
    export_report: { label: "导出报表", color: "text-orange-600" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Token 中心</h1>
        <Link href="/business/tokens/history" className="text-xs text-[#1A6EFF]">
          全部记录 →
        </Link>
      </div>

      <div className="px-4 mt-4">
        {/* Balance Card */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 rounded-xl p-5 text-white mb-6">
          <p className="text-white/70 text-xs">当前余额</p>
          <p className="text-4xl font-bold mt-1">🪙 {balance.toLocaleString()}</p>
          <div className="flex gap-4 mt-3 text-white/80 text-xs">
            <span>累计获得: {user?.tokenAccount?.totalEarned.toLocaleString() ?? 0}</span>
            <span>累计消耗: {user?.tokenAccount?.totalSpent.toLocaleString() ?? 0}</span>
          </div>
        </div>

        {/* Recharge Packages */}
        <h3 className="text-sm font-semibold text-slate-900 mb-3">💎 充值套餐</h3>
        <div className="space-y-3">
          {TOKEN_PACKAGES.map((pkg) => (
            <Card
              key={pkg.id}
              className={`hover:border-amber-300 transition-colors cursor-pointer ${
                pkg.recommended ? "ring-2 ring-amber-400" : ""
              }`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {pkg.id === "trial" ? "⭐" : pkg.id === "basic" ? "💎" : pkg.id === "growth" ? "🚀" : "🏢"}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {pkg.name}
                      {pkg.recommended && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-medium">
                          推荐
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">赠送 {pkg.bonus} · 共得 {pkg.tokens.toLocaleString()} Token</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">¥{pkg.price}</p>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-full">
                    购买
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-xl text-center">
          <p className="text-xs text-slate-400">
            💡 MVP 阶段：注册即送 500 Token，如需更多请联系管理员手动充值
          </p>
        </div>

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-slate-900 mt-6 mb-3">📋 最近记录</h3>
            <div className="space-y-1">
              {transactions.map((tx) => {
                const style = consumeTypeLabels[tx.type] || { label: tx.type, color: "text-slate-600" };
                return (
                  <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg border border-slate-50">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-600 truncate">{tx.description}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        <Badge variant="slate" size="sm">{style.label}</Badge>
                        <span className="ml-1">{timeAgo(tx.createdAt)}</span>
                      </p>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ml-2 ${tx.amount > 0 ? "text-green-600" : "text-slate-600"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
