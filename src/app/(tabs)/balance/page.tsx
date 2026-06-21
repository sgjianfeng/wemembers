import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { formatMoney, timeAgo } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";

export default async function BalancePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // ── 所有有效券的余额汇总 ──
  const activeVouchers = await prisma.voucher.findMany({
    where: { customerId: session.userId, status: "active" },
    select: { balanceCents: true, id: true },
  });
  const totalBalance = activeVouchers.reduce(
    (sum, v) => sum + v.balanceCents,
    0,
  );

  // ── 消费记录（按时间倒序） ──
  const usages = await prisma.voucherUsage.findMany({
    where: { voucher: { customerId: session.userId } },
    include: {
      voucher: {
        select: {
          balanceCents: true,
          amountCents: true,
          id: true,
        },
      },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // 为每笔消费计算当时的「剩余余额」
  // 思路：同张券的消费按时间倒序排列，从当前余额开始逐步加回已用金额
  const runningBalanceMap: Record<string, number> = {};
  const usagesWithBalanceAfter = usages.map((u) => {
    if (runningBalanceMap[u.voucherId] === undefined) {
      runningBalanceMap[u.voucherId] = u.voucher.balanceCents;
    }
    const balanceAfter = runningBalanceMap[u.voucherId];
    runningBalanceMap[u.voucherId] += u.amountCents;
    return { ...u, balanceAfter };
  });

  return (
    <div className="pb-4">
      {/* 页面标题 */}
      <div className="px-4 py-4 border-b border-slate-100">
        <h1 className="text-lg font-semibold">
          {t("voucher.balance.title", lang)}
        </h1>
      </div>

      {/* 可用余额卡片 */}
      <div className="px-4 mt-4">
        <Card className="bg-gradient-to-r from-amber-500 to-amber-400 border-0">
          <CardContent className="p-5">
            <p className="text-sm text-white/80">
              {t("voucher.balance.total", lang)}
            </p>
            <p className="text-3xl font-bold text-white mt-1">
              S${formatMoney(totalBalance)}
            </p>
            <p className="text-xs text-white/60 mt-1">
              {activeVouchers.length}{" "}
              {lang === "en" ? "voucher(s)" : "张券"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 消费记录 */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          {t("voucher.balance.usages", lang)}
        </h2>
        <div className="space-y-2">
          {usagesWithBalanceAfter.length > 0
            ? usagesWithBalanceAfter.map((u) => (
                <Card key={u.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm shrink-0">
                          🏪
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {u.store?.name ||
                              t("voucher.balance.spendAt", lang, {
                                store: "",
                              })}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {timeAgo(u.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-semibold text-slate-900">
                          -S${formatMoney(u.amountCents)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {t("voucher.balanceAfter", lang)} S$
                          {formatMoney(u.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            : /* 空状态 */
              (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-4xl mb-2">💳</p>
                  <p className="text-sm">
                    {t("voucher.balance.noUsages", lang)}
                  </p>
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
