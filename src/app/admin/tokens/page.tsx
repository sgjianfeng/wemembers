import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default async function AdminTokensPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  // Token 统计
  const [totalIssued, totalSpent, tokenAccounts] = await Promise.all([
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { amount: { gt: 0 } },
    }),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { amount: { lt: 0 } },
    }),
    prisma.tokenAccount.findMany({
      include: {
        user: { select: { displayName: true, email: true, phone: true, businessName: true, role: true } },
      },
      orderBy: { balance: "desc" },
      take: 50,
    }),
  ]);

  const totalBalance = tokenAccounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">Token 管理</h1>
      </div>

      <div className="px-4 mt-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-600">{(totalIssued._sum.amount || 0).toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">已发放</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-orange-600">{Math.abs(totalSpent._sum.amount || 0).toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">已消耗</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-amber-600">{totalBalance.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">流通中</p>
            </CardContent>
          </Card>
        </div>

        {/* Account List */}
        <h3 className="text-sm font-semibold text-slate-900 mb-3">
          账户列表 ({tokenAccounts.length})
        </h3>
        <div className="space-y-1">
          {tokenAccounts.map((account) => {
            const user = account.user;
            return (
              <div key={account.id} className="flex items-center justify-between px-3 py-2.5 bg-white rounded-lg border border-slate-50">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {user.businessName || user.displayName || user.email || user.phone || "未知"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant={user.role === "business" ? "blue" : "slate"} size="sm">
                      {user.role === "business" ? "商家" : "客户"}
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      获得{account.totalEarned} · 消耗{account.totalSpent}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold text-amber-600 shrink-0 ml-2">
                  🪙 {account.balance.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
