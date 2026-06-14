import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/utils";
import { TopUpButton } from "./TopUpButton";
import { WithdrawButton } from "./WithdrawButton";

export default async function TokenRechargePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; topup?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const sp = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      tokenAccount: {
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 15 } },
      },
      stripeAccount: true,
    },
  });

  const balance = user?.tokenAccount?.balance ?? 0;
  const frozen = user?.tokenAccount?.frozenBalance ?? 0;
  const transactions = user?.tokenAccount?.transactions ?? [];
  const stripeAcct = user?.stripeAccount;
  const isStripeReady = stripeAcct?.chargesEnabled && stripeAcct?.payoutsEnabled;

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
    stripe_topup: { label: "Stripe 充值", color: "text-green-600" },
    withdrawal: { label: "提现", color: "text-red-600" },
    settlement_earn: { label: "跨店结算", color: "text-amber-600" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">💰 账户中心</h1>
        <p className="text-xs text-slate-400 mt-0.5">充值 · 提现 · 收款管理</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] border-0">
            <CardContent className="p-3 text-white">
              <p className="text-xs text-white/60">可用余额</p>
              <p className="text-xl font-bold mt-1">S${(balance / 100).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-100">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600">冻结中</p>
              <p className="text-xl font-bold text-amber-700 mt-1">S${(frozen / 100).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-slate-400">累计收益</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                S${((user?.tokenAccount?.totalEarned ?? 0) / 100).toFixed(0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Account Status */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">🏦 收款账户</h3>
            {isStripeReady ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-500 text-lg">✅</span>
                <div>
                  <p className="text-sm text-green-700 font-medium">账户已激活</p>
                  <p className="text-xs text-slate-400">可收款 · 可提现</p>
                </div>
              </div>
            ) : stripeAcct?.stripeAccountId ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-500 text-lg">⚠️</span>
                  <div>
                    <p className="text-sm text-amber-700 font-medium">待完成设置</p>
                    <p className="text-xs text-slate-400">点击下方按钮绑定银行卡</p>
                  </div>
                </div>
                <a
                  href={`/api/stripe/account`}
                  onClick={async (e) => {
                    e.preventDefault();
                    const res = await fetch("/api/stripe/account", { method: "POST" });
                    const data = await res.json();
                    if (data.data?.url) window.location.href = data.data.url;
                  }}
                  className="inline-block px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
                >
                  设置收款账户 →
                </a>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-2">完成收款设置后可充值提现</p>
                <a
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault();
                    const res = await fetch("/api/stripe/account", { method: "POST" });
                    const data = await res.json();
                    if (data.data?.url) window.location.href = data.data.url;
                  }}
                  className="inline-block px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
                >
                  设置收款账户 →
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top-up + Withdraw */}
        {isStripeReady && (
          <div className="flex gap-2">
            <TopUpButton />
            <WithdrawButton balance={balance} />
          </div>
        )}

        {/* Status messages */}
        {sp.onboarding === "success" && (
          <div className="text-center p-3 bg-green-50 text-green-700 text-sm rounded-xl">
            ✅ 收款账户设置成功！现在可以充值和提现了
          </div>
        )}
        {sp.topup === "success" && (
          <div className="text-center p-3 bg-green-50 text-green-700 text-sm rounded-xl">
            ✅ 充值成功！余额将在几秒内到账
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">📋 交易记录</h3>
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
                    <span className={`text-sm font-semibold shrink-0 ml-2 ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.amount > 0 ? "+" : ""}S${(Math.abs(tx.amount) / 100).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
