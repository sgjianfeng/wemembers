import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { timeAgo } from "@/lib/utils";
import { TopUpButton } from "./TopUpButton";
import { WithdrawButton } from "./WithdrawButton";
import { StripeSetupButton } from "./StripeSetupButton";
import { releaseMaturedHolds } from "@/lib/tokens";

export default async function TokenRechargePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; topup?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  // Auto-release T+1 matured redeem / commission holds
  await releaseMaturedHolds(session.userId);

  const sp = await searchParams;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

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

  const consumeTypeLabels: Record<string, { zh: string; en: string; color: string }> = {
    purchase: { zh: "购买", en: "Purchase", color: "text-green-600" },
    free_grant: { zh: "赠送", en: "Free Grant", color: "text-blue-600" },
    signup_bonus: { zh: "注册奖励", en: "Signup Bonus", color: "text-blue-600" },
    referral_bonus: { zh: "推荐奖励", en: "Referral Bonus", color: "text-blue-600" },
    admin_adjust: { zh: "管理员调整", en: "Admin Adjustment", color: "text-purple-600" },
    coupon_create: { zh: "创建代金券", en: "Create Coupon", color: "text-orange-600" },
    sms_notify: { zh: "短信通知", en: "SMS Notification", color: "text-orange-600" },
    email_notify: { zh: "邮件通知", en: "Email Notification", color: "text-orange-600" },
    redeem_verify: { zh: "核销验证", en: "Redeem Verification", color: "text-orange-600" },
    member_add: { zh: "添加会员", en: "Add Member", color: "text-orange-600" },
    export_report: { zh: "导出报表", en: "Export Report", color: "text-orange-600" },
    stripe_topup: { zh: "Stripe 充值", en: "Stripe Top-Up", color: "text-green-600" },
    withdrawal: { zh: "提现", en: "Withdrawal", color: "text-red-600" },
    settlement_earn: { zh: "跨店结算", en: "Cross-store Settlement", color: "text-amber-600" },
    voucher_redeem_income: { zh: "核销收入", en: "Redeem income", color: "text-amber-600" },
    voucher_spend_income: { zh: "购券即用", en: "Spend-at-buy", color: "text-amber-600" },
    seller_commission: { zh: "卖券佣金", en: "Seller commission", color: "text-green-600" },
    t1_release: { zh: "T+1 解冻", en: "T+1 unlock", color: "text-blue-600" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">{t("business.tokens.title", lang)}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("business.tokens.subtitle", lang)}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-gradient-to-b from-[#1A6EFF] to-[#3B82F6] border-0">
            <CardContent className="p-3 text-white">
              <p className="text-xs text-white/60">{t("business.tokens.available", lang)}</p>
              <p className="text-xl font-bold mt-1">S${(balance / 100).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-100">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600">{t("business.tokens.frozen", lang)}</p>
              <p className="text-xl font-bold text-amber-700 mt-1">S${(frozen / 100).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-slate-400">{t("business.tokens.earned", lang)}</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                S${((user?.tokenAccount?.totalEarned ?? 0) / 100).toFixed(0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Account Status */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("business.tokens.stripeTitle", lang)}</h3>
            {isStripeReady ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-500 text-lg">✅</span>
                <div>
                  <p className="text-sm text-green-700 font-medium">{t("business.tokens.stripeReady", lang)}</p>
                  <p className="text-xs text-slate-400">{t("business.tokens.stripeReadyDesc", lang)}</p>
                </div>
              </div>
            ) : stripeAcct?.stripeAccountId ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-500 text-lg">⚠️</span>
                  <div>
                    <p className="text-sm text-amber-700 font-medium">{t("business.tokens.stripePending", lang)}</p>
                    <p className="text-xs text-slate-400">{t("business.tokens.stripePendingDesc", lang)}</p>
                  </div>
                </div>
                <StripeSetupButton label={t("business.tokens.stripeSetup", lang)} />
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-2">{t("business.tokens.stripeSetupHint", lang)}</p>
                <StripeSetupButton label={t("business.tokens.stripeSetup", lang)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top-up always available (Checkout); withdraw needs Connect ready */}
        <div className="flex gap-2">
          <TopUpButton />
          {isStripeReady && <WithdrawButton balance={balance} />}
        </div>

        {/* Status messages */}
        {sp.onboarding === "success" && (
          <div className="text-center p-3 bg-green-50 text-green-700 text-sm rounded-xl">
            {t("business.tokens.topupSuccess", lang)}
          </div>
        )}
        {sp.topup === "success" && (
          <div className="text-center p-3 bg-green-50 text-green-700 text-sm rounded-xl">
            {t("business.tokens.paymentSuccess", lang)}
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("business.tokens.transactions", lang)}</h3>
            <div className="space-y-1">
              {transactions.map((tx) => {
                const style = consumeTypeLabels[tx.type] || { zh: tx.type, en: tx.type, color: "text-slate-600" };
                return (
                  <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg border border-slate-50">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-600 truncate">{tx.description}</p>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Badge variant="slate" size="sm">{lang === "zh" ? style.zh : style.en}</Badge>
                        <span>{timeAgo(tx.createdAt)}</span>
                      </div>
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
