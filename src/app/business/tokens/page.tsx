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
import { StripeStatusPanel } from "./StripeStatusPanel";
import { releaseMaturedHolds } from "@/lib/tokens";
import { getAccountStatus } from "@/lib/stripe";

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

  // Always refresh Connect status from Stripe when returning from onboarding
  // (webhook may lag or miss if metadata was not set on older accounts)
  const existingStripe = await prisma.stripeAccount.findUnique({
    where: { userId: session.userId },
  });
  if (existingStripe?.stripeAccountId) {
    try {
      const status = await getAccountStatus(existingStripe.stripeAccountId);
      await prisma.stripeAccount.update({
        where: { userId: session.userId },
        data: {
          chargesEnabled: status.chargesEnabled,
          payoutsEnabled: status.payoutsEnabled,
          detailsSubmitted: status.detailsSubmitted,
        },
      });
    } catch (e) {
      console.error("tokens page stripe refresh:", e);
    }
  }

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
  const giftBalance =
    (user?.tokenAccount as { giftBalance?: number } | undefined)?.giftBalance ??
    0;
  const frozen = user?.tokenAccount?.frozenBalance ?? 0;
  const transactions = user?.tokenAccount?.transactions ?? [];
  const stripeAcct = user?.stripeAccount;
  // Transfer to Connect needs charges_enabled; bank payout may lag (payouts_enabled)
  const canWithdraw = !!stripeAcct?.chargesEnabled;
  const isStripeFullyReady =
    !!stripeAcct?.chargesEnabled && !!stripeAcct?.payoutsEnabled;
  const isStripePartial =
    !!stripeAcct?.detailsSubmitted &&
    !!stripeAcct?.chargesEnabled &&
    !stripeAcct?.payoutsEnabled;

  // 自用/独享：只计实付>0（排除国庆零元大奖签等）
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const campBiz = { campaign: { businessId: session.userId } };
  const paidFilter = { paidCents: { gt: 0 } as const };
  const [selfSoldToday, selfSoldAll, selfPending, distSoldAll, recentSales] =
    await Promise.all([
      prisma.voucher.aggregate({
        where: {
          productKind: "self_use",
          ...campBiz,
          ...paidFilter,
          createdAt: { gte: dayStart },
        },
        _sum: { paidCents: true },
        _count: true,
      }),
      prisma.voucher.aggregate({
        where: { productKind: "self_use", ...campBiz, ...paidFilter },
        _sum: { paidCents: true },
        _count: true,
      }),
      prisma.voucher.aggregate({
        where: {
          productKind: "self_use",
          status: "active",
          balanceCents: { gt: 0 },
          ...campBiz,
        },
        _sum: { balanceCents: true },
      }),
      prisma.voucher.aggregate({
        where: {
          productKind: "distribution",
          ...campBiz,
          ...paidFilter,
        },
        _sum: { paidCents: true, sellerCommissionCents: true },
        _count: true,
      }),
      // 近期真卖出（含独享/自用/分发），供「卖券明细」— 不依赖代币流水
      prisma.voucher.findMany({
        where: {
          ...campBiz,
          ...paidFilter,
        },
        select: {
          id: true,
          shortCode: true,
          paidCents: true,
          amountCents: true,
          balanceCents: true,
          productKind: true,
          paymentMethod: true,
          createdAt: true,
          campaign: { select: { name: true, type: true } },
          customer: { select: { phone: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
  const selfSoldCents = selfSoldToday._sum.paidCents ?? 0;
  const selfSoldCount = selfSoldToday._count;
  const selfSoldAllCents = selfSoldAll._sum.paidCents ?? 0;
  const selfSoldAllCount = selfSoldAll._count;
  const selfPendingCents = selfPending._sum.balanceCents ?? 0;
  const distSoldAllCents = distSoldAll._sum.paidCents ?? 0;
  const distSoldAllCount = distSoldAll._count;
  const distCommCents = distSoldAll._sum.sellerCommissionCents ?? 0;

  // 业务入账：只计真实收入流水（不含平台赠送额度）
  // totalEarned 计数器历史上把赠送也加进去了，不能直接当「卖券收益」
  const totalEarnedAll = user?.tokenAccount?.totalEarned ?? 0;
  const accountId = user?.tokenAccount?.id;
  const pureIncomeAgg = accountId
    ? await prisma.tokenTransaction.aggregate({
        where: {
          accountId,
          amount: { gt: 0 },
          type: {
            in: [
              "voucher_redeem_income",
              "voucher_spend_income",
              "seller_commission",
              "settlement_earn",
              "platform_fee",
            ],
          },
        },
        _sum: { amount: true },
      })
    : { _sum: { amount: null as number | null } };
  const businessEarnedCents = pureIncomeAgg._sum.amount ?? 0;

  const consumeTypeLabels: Record<string, { zh: string; en: string; color: string }> = {
    purchase: { zh: "购买", en: "Purchase", color: "text-green-600" },
    free_grant: { zh: "赠送", en: "Free Grant", color: "text-blue-600 dark:text-blue-400" },
    signup_bonus: { zh: "注册奖励", en: "Signup Bonus", color: "text-blue-600 dark:text-blue-400" },
    referral_bonus: { zh: "推荐奖励", en: "Referral Bonus", color: "text-blue-600 dark:text-blue-400" },
    admin_adjust: { zh: "管理员调整", en: "Admin Adjustment", color: "text-purple-600" },
    coupon_create: { zh: "创建代金券", en: "Create Coupon", color: "text-orange-600" },
    sms_notify: { zh: "短信通知", en: "SMS Notification", color: "text-orange-600" },
    email_notify: { zh: "邮件通知", en: "Email Notification", color: "text-orange-600" },
    redeem_verify: { zh: "核销验证", en: "Redeem Verification", color: "text-orange-600" },
    member_add: { zh: "添加会员", en: "Add Member", color: "text-orange-600" },
    export_report: { zh: "导出报表", en: "Export Report", color: "text-orange-600" },
    stripe_topup: { zh: "Stripe 充值", en: "Stripe Top-Up", color: "text-green-600" },
    withdrawal: { zh: "提现", en: "Withdrawal", color: "text-red-600" },
    settlement_earn: { zh: "跨店结算", en: "Cross-store Settlement", color: "text-amber-600 dark:text-amber-400" },
    voucher_redeem_income: { zh: "核销收入", en: "Redeem income", color: "text-amber-600 dark:text-amber-400" },
    voucher_spend_income: { zh: "购券即用", en: "Spend-at-buy", color: "text-amber-600 dark:text-amber-400" },
    seller_commission: { zh: "卖券佣金", en: "Seller commission", color: "text-green-600" },
    t1_release: { zh: "T+1 解冻", en: "T+1 unlock", color: "text-blue-600 dark:text-blue-400" },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold">{t("business.tokens.title", lang)}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("business.tokens.subtitle", lang)}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Balance Cards */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-gradient-to-b from-primary to-[#3B82F6] border-0">
            <CardContent className="p-3 text-white">
              <p className="text-xs text-white/60">
                {lang === "en" ? "Withdrawable" : "可提现"}
              </p>
              <p className="text-xl font-bold mt-1 tabular-nums">
                S${(balance / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-white/70 mt-0.5 leading-snug">
                {lang === "en"
                  ? "Platform wallet cash · withdraw via Stripe"
                  : "平台钱包现金 · 经 Stripe 提现"}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50 dark:bg-emerald-950/35 border-emerald-100 dark:border-emerald-800/50">
            <CardContent className="p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {lang === "en" ? "Platform credit (no withdraw)" : "平台额度（不可提）"}
              </p>
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-1 tabular-nums">
                S${(giftBalance / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400/80 mt-0.5 leading-snug">
                {lang === "en"
                  ? "Only covers exclusive platform fee (2%). Not sales income."
                  : "仅可抵独享服务费 2% · 不是卖券收入"}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-950/35 border-amber-100 dark:border-amber-800/50">
            <CardContent className="p-3">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("business.tokens.frozen", lang)}
              </p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                S${(frozen / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-snug">
                {lang === "en"
                  ? "T+1 hold · unlocks next day"
                  : "T+1 冻结 · 次日解冻进可提现"}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-muted/50 border-0">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">
                {lang === "en" ? "Business income (ledger)" : "业务入账累计"}
              </p>
              <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                S${(businessEarnedCents / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {lang === "en"
                  ? `Excludes gift credit · raw counter S$${(totalEarnedAll / 100).toFixed(2)}`
                  : `不含平台赠送 · 原始计数器 S$${(totalEarnedAll / 100).toFixed(2)}`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 卖券一览：和钱包分开，避免「只看见一笔」 */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {lang === "en" ? "Voucher sales (all time)" : "卖券记录（全部）"}
            </h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lang === "en"
                ? "Self-use cash stays in-store (not platform wallet). Distribution may settle commission after redeem."
                : "自用/独享：钱在店里收，不进上方「可提现」。分发券：核销后才可能有佣金进钱包。"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground">
                  {lang === "en" ? "Self-use sold" : "自用/独享售出"}
                </p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {selfSoldAllCount}{" "}
                  <span className="text-sm font-semibold text-muted-foreground">
                    · S${(selfSoldAllCents / 100).toFixed(2)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground">
                  {lang === "en" ? "Distribution sold" : "分发售出"}
                </p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {distSoldAllCount}{" "}
                  <span className="text-sm font-semibold text-muted-foreground">
                    · S${(distSoldAllCents / 100).toFixed(2)}
                  </span>
                </p>
                {distCommCents > 0 && (
                  <p className="text-[10px] text-green-700 mt-0.5">
                    {lang === "en" ? "Comm." : "已计佣金"} S$
                    {(distCommCents / 100).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 分发券结算（平台钱包）· 折叠卡 */}
        <StripeStatusPanel
          initial={{
            hasAccount: Boolean(stripeAcct?.stripeAccountId),
            chargesEnabled: Boolean(stripeAcct?.chargesEnabled),
            payoutsEnabled: Boolean(stripeAcct?.payoutsEnabled),
            detailsSubmitted: Boolean(stripeAcct?.detailsSubmitted),
          }}
        />

        {/* 自用券：已收款 / 待核销（不进平台可用） */}
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-4 rounded-full bg-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {t("tokens.selfTitle", lang)}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              {t("tokens.selfHint", lang)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground">
                  {lang === "en" ? "Sold today" : "今日售出"}
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">
                  S${(selfSoldCents / 100).toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {selfSoldCount}{" "}
                  {lang === "en" ? "orders (incl. PayNow/Stripe)" : "笔（含线上付）"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground">
                  {t("tokens.selfPending", lang)}
                </p>
                <p className="text-xl font-bold text-muted-foreground tabular-nums mt-0.5">
                  S${(selfPendingCents / 100).toFixed(2)}
                </p>
              </div>
            </div>
            <a
              href="/business/issue-self"
              className="mt-3 inline-flex text-xs font-medium text-primary"
            >
              现金发自用券 →
            </a>
          </CardContent>
        </Card>

        {/* Top-up always available (Checkout); withdraw needs charges_enabled */}
        <div className="flex gap-2">
          <TopUpButton />
          {canWithdraw && <WithdrawButton balance={balance} />}
        </div>

        {/* Status messages — accurate after Stripe refresh above */}
        {sp.onboarding === "success" && isStripeFullyReady && (
          <div className="text-center p-3 bg-green-50 dark:bg-green-950/35 text-green-700 dark:text-green-400 text-sm rounded-xl">
            {t("business.tokens.onboardingDone", lang)}
          </div>
        )}
        {sp.onboarding === "success" && isStripePartial && (
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/35 text-blue-800 text-sm rounded-xl">
            {t("business.tokens.onboardingPartial", lang)}
          </div>
        )}
        {sp.onboarding === "success" &&
          !isStripeFullyReady &&
          !isStripePartial && (
            <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/35 text-amber-800 text-sm rounded-xl">
              {t("business.tokens.onboardingIncomplete", lang)}
            </div>
          )}
        {sp.topup === "success" && (
          <div className="text-center p-3 bg-green-50 dark:bg-green-950/35 text-green-700 dark:text-green-400 text-sm rounded-xl">
            {t("business.tokens.paymentSuccess", lang)}
          </div>
        )}

        {/* 卖券明细：独享/自用线上付不进代币流水，单独列出 */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {lang === "en" ? "Sales detail" : "卖券明细"}
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            {lang === "en"
              ? "Paid orders (Stripe/PayNow/cash). Exclusive sales stay as customer credit until redeem — not platform withdrawable."
              : "顾客实付订单（Stripe/PayNow/现金）。独享售出记为顾客预付权益，不进上方「可提现」，故也不会出现在「钱包流水」里。"}
          </p>
          {recentSales.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 bg-card rounded-lg border border-border text-center">
              {lang === "en" ? "No paid sales yet" : "暂无实付卖券记录"}
            </p>
          ) : (
            <div className="space-y-1">
              {recentSales.map((sale) => {
                const isSelf = sale.productKind === "self_use";
                const pay =
                  sale.paymentMethod === "stripe"
                    ? "Stripe/PayNow"
                    : sale.paymentMethod === "cash"
                      ? lang === "en"
                        ? "Cash"
                        : "现金"
                      : sale.paymentMethod || "—";
                const who =
                  sale.customer?.displayName ||
                  sale.customer?.phone ||
                  (lang === "en" ? "Customer" : "顾客");
                return (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 bg-card rounded-lg border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {sale.campaign?.name || "—"}
                        {sale.shortCode ? (
                          <span className="font-mono text-primary ml-1.5 tracking-wider">
                            {sale.shortCode}
                          </span>
                        ) : null}
                      </p>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                        <Badge variant="slate" size="sm">
                          {isSelf
                            ? lang === "en"
                              ? "Self/Exclusive"
                              : "自用/独享"
                            : lang === "en"
                              ? "Distribution"
                              : "分发"}
                        </Badge>
                        <span>{pay}</span>
                        <span>·</span>
                        <span className="truncate max-w-[8rem]">{who}</span>
                        <span>·</span>
                        <span>{timeAgo(sale.createdAt)}</span>
                      </div>
                      {isSelf && sale.balanceCents > 0 && (
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          {lang === "en"
                            ? `Customer balance left S$${(sale.balanceCents / 100).toFixed(2)} (not withdrawable)`
                            : `顾客剩余可花 S$${(sale.balanceCents / 100).toFixed(2)}（未核销，不可提）`}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold shrink-0 text-foreground tabular-nums">
                      S${(sale.paidCents / 100).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 钱包流水：仅 TokenAccount 变动（充值/赠送/扣服务费/核销入账等） */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {lang === "en" ? "Wallet ledger" : "钱包流水"}
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
            {lang === "en"
              ? "Token wallet only (top-up, gift credit, fees). Not a full sales journal."
              : "仅平台钱包变动（充值、赠送额度、服务费等）。独享购券本身不写这里。"}
          </p>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-4 bg-card rounded-lg border border-border text-center">
              {lang === "en" ? "No wallet movements" : "暂无钱包流水"}
            </p>
          ) : (
            <div className="space-y-1">
              {transactions.map((tx) => {
                const style = consumeTypeLabels[tx.type] || {
                  zh: tx.type,
                  en: tx.type,
                  color: "text-muted-foreground",
                };
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-card rounded-lg border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.description}
                      </p>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Badge variant="slate" size="sm">
                          {lang === "zh" ? style.zh : style.en}
                        </Badge>
                        <span>{timeAgo(tx.createdAt)}</span>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold shrink-0 ml-2 ${
                        tx.amount > 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}S$
                      {(Math.abs(tx.amount) / 100).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
