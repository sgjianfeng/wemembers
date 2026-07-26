import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Coins } from "lucide-react";
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
      <div className="px-4 py-3 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">商家管理</h1>
        <p className="text-xs text-muted-foreground mt-0.5 nums">共 {businesses.length} 家</p>
      </div>
      {businesses.length === 0 ? (
        <EmptyState
          tone="calm"
          icon="stores"
          title="暂无商家"
          description="还没有商家入驻本平台"
          className="py-12"
        />
      ) : (
        <div className="px-4 mt-3 space-y-2">
          {businesses.map((biz) => (
            <Link key={biz.id} href={`/admin/businesses/${biz.id}`}>
              <Card className="hover:border-primary/30 active:scale-[0.97] transition-transform">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{biz.businessName || "未命名"}</p>
                      <Badge variant={biz.status === "active" ? "green" : "red"} size="sm">
                        {biz.status === "active" ? "正常" : biz.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {biz.email} · {biz.businessCategory || "未分类"} · {biz.createdAt.toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 shrink-0 ml-2 flex items-center gap-1 nums">
                    <Coins size={14} /> {biz.tokenAccount?.balance?.toLocaleString() ?? 0}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
