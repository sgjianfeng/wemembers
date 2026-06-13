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
  sms_notify: { label: "短信", variant: "orange" },
  email_notify: { label: "邮件", variant: "orange" },
  redeem_verify: { label: "核销", variant: "orange" },
  member_add: { label: "加会员", variant: "orange" },
  export_report: { label: "导出", variant: "orange" },
};

export default async function TokenHistoryPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const account = await prisma.tokenAccount.findUnique({
    where: { userId: session.userId },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">Token 流水</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          余额: 🪙 {account?.balance.toLocaleString() ?? 0}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-1">
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
              <div className="text-right shrink-0 ml-2">
                <p className={`text-sm font-semibold ${tx.amount > 0 ? "text-green-600" : "text-slate-600"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </p>
                <p className="text-[10px] text-slate-400">余额: {tx.balanceAfter}</p>
              </div>
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
  );
}
