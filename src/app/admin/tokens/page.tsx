import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/** 商户现金钱包一览（单位：分 → S$）。运营 Token 已下线。 */
export default async function AdminWalletPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  const [inflow, outflow, tokenAccounts] = await Promise.all([
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: {
        amount: { gt: 0 },
        type: {
          in: [
            "stripe_topup",
            "voucher_redeem_income",
            "voucher_spend_income",
            "seller_commission",
            "platform_fee",
            "settlement_earn",
            "t1_release",
            "admin_adjust",
          ],
        },
      },
    }),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { amount: { lt: 0 } },
    }),
    prisma.tokenAccount.findMany({
      where: { user: { role: { in: ["business"] } } },
      include: {
        user: {
          select: {
            displayName: true,
            email: true,
            phone: true,
            businessName: true,
            role: true,
          },
        },
      },
      orderBy: { balance: "desc" },
      take: 50,
    }),
  ]);

  const totalBalance = tokenAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalFrozen = tokenAccounts.reduce((sum, a) => sum + (a.frozenBalance || 0), 0);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">商户账户余额</h1>
        <p className="text-xs text-slate-400 mt-0.5">现金钱包（S$）· 运营 Token 已取消</p>
      </div>

      <div className="px-4 mt-4">
        <div className="grid grid-cols-3 gap-2 mb-5">
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-600">
                S${((inflow._sum.amount || 0) / 100).toFixed(0)}
              </p>
              <p className="text-[10px] text-slate-400">入账合计</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-orange-600">
                S${(Math.abs(outflow._sum.amount || 0) / 100).toFixed(0)}
              </p>
              <p className="text-[10px] text-slate-400">出账合计</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-blue-600">
                S${(totalBalance / 100).toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400">可用余额</p>
              {totalFrozen > 0 && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  冻结 S${(totalFrozen / 100).toFixed(2)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          商家账户 ({tokenAccounts.length})
        </h3>
        <div className="space-y-1">
          {tokenAccounts.length === 0 && (
            <p className="text-xs text-slate-400 py-6 text-center">暂无商家钱包数据</p>
          )}
          {tokenAccounts.map((account) => {
            const user = account.user;
            return (
              <div
                key={account.id}
                className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg border border-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {user.businessName || user.displayName || user.email || user.phone || "未知"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="blue" size="sm">
                      商家
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      累计入账 S${(account.totalEarned / 100).toFixed(2)}
                      {(account.frozenBalance || 0) > 0
                        ? ` · 冻结 S${(account.frozenBalance / 100).toFixed(2)}`
                        : ""}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900 shrink-0 ml-2">
                  S${(account.balance / 100).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
