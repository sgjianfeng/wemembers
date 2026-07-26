import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Building2, Users, TicketPercent, Coins } from "lucide-react";
import { formatMoney } from "@/lib/utils";

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

  const feeSgd = formatMoney(platformFees._sum.amount || 0);

  const stats = [
    { icon: Building2, label: "商家数", value: bc.toString() },
    { icon: Users, label: "会员数", value: cc.toString() },
    { icon: TicketPercent, label: "代金券", value: pc.toString() },
    { icon: Coins, label: "平台服务费", value: `S$${feeSgd}` },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">平台概览</h1>
      </div>
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <s.icon size={22} strokeWidth={1.9} className="text-muted-foreground" />
              <p className="text-2xl font-bold text-foreground mt-2 nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
