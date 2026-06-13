import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export default async function AdminBusinessesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/auth/login");

  const businesses = await prisma.user.findMany({
    where: { role: "business" },
    include: { tokenAccount: { select: { balance: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">商家管理</h1>
        <p className="text-xs text-slate-400 mt-0.5">共 {businesses.length} 家</p>
      </div>
      <div className="px-4 mt-3 space-y-2">
        {businesses.map((biz) => (
          <Link key={biz.id} href={`/admin/businesses/${biz.id}`}>
            <Card className="hover:border-[#1A6EFF]/30">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 truncate">{biz.businessName || "未命名"}</p>
                    <Badge variant={biz.status === "active" ? "green" : "red"} size="sm">
                      {biz.status === "active" ? "正常" : biz.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {biz.email} · {biz.businessCategory || "未分类"} · {biz.createdAt.toLocaleDateString("zh-CN")}
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-600 shrink-0 ml-2">
                  🪙 {biz.tokenAccount?.balance?.toLocaleString() ?? 0}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
