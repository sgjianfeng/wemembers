import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  const [bc, cc, pc, platformFees] = await Promise.all([
    prisma.user.count({ where: { role: "business", status: "active" } }),
    prisma.user.count({ where: { role: "customer", status: "active" } }),
    prisma.coupon.count(),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { type: "platform_fee" },
    }),
  ]);

  const feeSgd = ((platformFees._sum.amount || 0) / 100).toFixed(2);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">平台概览</h1>
      </div>
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {[
          { icon: "🏢", label: "商家数", value: bc.toString() },
          { icon: "👤", label: "会员数", value: cc.toString() },
          { icon: "🎫", label: "代金券", value: pc.toString() },
          { icon: "💰", label: "平台服务费", value: `S$${feeSgd}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <span className="text-2xl">{s.icon}</span>
              <p className="text-2xl font-bold text-slate-900 mt-2">{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
