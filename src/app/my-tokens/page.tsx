import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/utils";

const labels: Record<string, { label: string; variant: "green" | "blue" | "orange" | "purple" | "slate" }> = {
  purchase: { label: "购买", variant: "green" },
  free_grant: { label: "赠送", variant: "blue" },
  signup_bonus: { label: "注册奖励", variant: "blue" },
  referral_bonus: { label: "推荐奖励", variant: "blue" },
  admin_adjust: { label: "调整", variant: "purple" },
  coupon_create: { label: "创建券", variant: "orange" },
  coupon_claim: { label: "领取券", variant: "orange" },
  sms_notify: { label: "短信", variant: "orange" },
  email_notify: { label: "邮件", variant: "orange" },
  redeem_verify: { label: "核销", variant: "orange" },
  member_add: { label: "加会员", variant: "orange" },
  export_report: { label: "导出", variant: "orange" },
};

export default async function MyTokensPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const account = await prisma.tokenAccount.findUnique({
    where: { userId: session.userId },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  const balance = account?.balance ?? 0;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">我的 Token</h1>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 rounded-xl p-5 text-white mb-6">
          <p className="text-white/70 text-xs">当前余额</p>
          <p className="text-4xl font-bold mt-1">🪙 {balance.toLocaleString()}</p>
          <div className="flex gap-4 mt-3 text-white/80 text-xs">
            <span>累计获得: {account?.totalEarned.toLocaleString() ?? 0}</span>
            <span>累计消耗: {account?.totalSpent.toLocaleString() ?? 0}</span>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-slate-900 mb-3">📋 Token 记录</h3>
        <div className="space-y-1">
          {account?.transactions.map((tx) => {
            const style = labels[tx.type] || { label: tx.type, variant: "slate" as const };
            return (
              <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg border border-slate-50">
                <div className="min-w-0">
                  <p className="text-xs text-slate-600 truncate">{tx.description}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={style.variant} size="sm">{style.label}</Badge>
                    <span className="text-[10px] text-slate-400">{timeAgo(tx.createdAt)}</span>
                  </div>
                </div>
                <p className={`text-sm font-semibold shrink-0 ml-2 ${tx.amount > 0 ? "text-green-600" : "text-slate-500"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </p>
              </div>
            );
          })}
          {(!account || account.transactions.length === 0) && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">暂无记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
