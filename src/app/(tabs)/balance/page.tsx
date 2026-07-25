import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { formatMoney, timeAgo } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { WithdrawButton } from "./WithdrawButton";
import { VoucherShowQr } from "./VoucherShowQr";
import { SplitButton } from "./SplitButton";

export default async function BalancePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // ── 所有有效券的余额汇总 ──
  const activeVouchersRaw = await prisma.voucher.findMany({
    where: { customerId: session.userId, status: "active" },
    select: {
      balanceCents: true,
      id: true,
      shortCode: true,
      amountCents: true,
      productKind: true,
      campaign: {
        select: { name: true, slug: true, type: true, productKind: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 旧券补短码（懒生成，店员可口播）
  const { ensureVoucherShortCode } = await import("@/lib/voucher-short-code");
  const activeVouchers = await Promise.all(
    activeVouchersRaw.map(async (v) => {
      if (v.shortCode) return v;
      try {
        const shortCode = await ensureVoucherShortCode(v.id);
        return { ...v, shortCode };
      } catch {
        return v;
      }
    })
  );
  const totalBalance = activeVouchers.reduce(
    (sum, v) => sum + v.balanceCents,
    0,
  );

  // ── 购券记录（含已用尽，排除拆分产生的子券：用 paid>0 且有支付痕迹近似） ──
  const purchases = await prisma.voucher.findMany({
    where: {
      customerId: session.userId,
      OR: [
        { paymentMethod: { in: ["stripe", "cash"] } },
        { stripeSessionId: { not: null } },
        { paidCents: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      shortCode: true,
      amountCents: true,
      paidCents: true,
      balanceCents: true,
      status: true,
      productKind: true,
      paymentMethod: true,
      createdAt: true,
      campaign: { select: { name: true, productKind: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  // 拆分母券 used=0 status=exhausted 仍会显示；子券 paid 按比例分摊也会进列表 —— 可接受

  // ── 消费记录（按时间倒序） ──
  const usages = await prisma.voucherUsage.findMany({
    where: { voucher: { customerId: session.userId } },
    include: {
      voucher: {
        select: {
          balanceCents: true,
          amountCents: true,
          id: true,
          campaign: { select: { name: true } },
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
              {t("balance.voucherCount", lang, { count: activeVouchers.length })}
            </p>
            <p className="text-[11px] text-white/90 mt-2 font-medium">
              {t("balance.trustLine", lang)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 可核销的券列表 */}
      {activeVouchers.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            {t("balance.myVouchers", lang)}
          </h2>
          <div className="space-y-2">
            {activeVouchers.map((v) => {
              const isDraw = v.campaign?.type === "lucky_draw_v2";
              const isSelf =
                v.productKind === "self_use" ||
                v.campaign?.productKind === "self_use";
              return (
              <Card key={v.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span
                          className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            isSelf
                              ? "bg-slate-100 text-slate-700"
                              : isDraw
                                ? "bg-orange-50 text-orange-700"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {isDraw
                            ? isSelf
                              ? lang === "en"
                                ? "Exclusive"
                                : "独享券"
                              : lang === "en"
                                ? "Co-win"
                                : "共赢券"
                            : isSelf
                              ? lang === "en"
                                ? "Self-use"
                                : "自用券"
                              : lang === "en"
                                ? "Distribution"
                                : "分发券"}
                        </span>
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {v.campaign?.name || t("seller.type.draw", lang)}
                        </p>
                      </div>
                      {v.shortCode ? (
                        <p className="text-sm font-bold font-mono tracking-[0.2em] text-[#1A6EFF] mt-0.5">
                          {v.shortCode}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-mono break-all mt-0.5">
                          {t("balance.voucherId", lang)}: {v.id}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-600">
                        S${formatMoney(v.balanceCents)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {t("balance.face", lang)} S${formatMoney(v.amountCents)}
                      </p>
                    </div>
                  </div>
                  {isDraw && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {t("balance.drawWeightHint", lang)}
                    </p>
                  )}
                  <VoucherShowQr
                    voucherId={v.id}
                    shortCode={v.shortCode}
                    lang={lang}
                  />
                  <SplitButton
                    voucherId={v.id}
                    balanceCents={v.balanceCents}
                  />
                  {!isSelf && (
                    <WithdrawButton
                      voucherId={v.id}
                      balanceSgd={formatMoney(v.balanceCents)}
                      lang={lang}
                      mode={isDraw ? "draw" : "voucher"}
                    />
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 购券记录 */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          {t("balance.purchases", lang)}
        </h2>
        <div className="space-y-2">
          {purchases.length > 0 ? (
            purchases.map((p) => {
              const isSelf =
                p.productKind === "self_use" ||
                p.campaign?.productKind === "self_use";
              return (
                <Card key={p.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isSelf && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {lang === "en" ? "Self-use" : "自用券"}
                            </span>
                          )}
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {p.campaign?.name || "—"}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {timeAgo(p.createdAt)}
                          {p.shortCode ? ` · ${p.shortCode}` : ""}
                          {p.status !== "active" ? ` · ${p.status}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {t("balance.purchaseRow", lang, {
                            paid: formatMoney(p.paidCents),
                            face: formatMoney(p.amountCents),
                          })}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {lang === "en" ? "Left" : "剩余"} S$
                          {formatMoney(p.balanceCents)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-8 text-slate-400">
              <p className="text-3xl mb-2">🧾</p>
              <p className="text-sm">{t("balance.noPurchases", lang)}</p>
            </div>
          )}
        </div>
      </div>

      {/* 核销 / 消费记录 */}
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
                            {u.voucher?.campaign?.name
                              ? `${u.voucher.campaign.name} · `
                              : ""}
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
            : (
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
