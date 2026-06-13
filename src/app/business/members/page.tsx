import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const tierDisplay: Record<string, { label: string; variant: "slate" | "amber" | "purple" | "blue" }> = {
  regular: { label: "普通", variant: "slate" },
  silver: { label: "银卡", variant: "blue" },
  gold: { label: "金卡", variant: "amber" },
  platinum: { label: "铂金", variant: "purple" },
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tier?: string; sort?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff"))
    redirect("/auth/login");

  const sp = await searchParams;
  const search = sp.search || "";
  const tierFilter = sp.tier || "";
  const sort = sp.sort || "recent";

  const isBusiness = session.role === "business";

  const where: any = {
    businessId: session.userId,
    ...(search
      ? {
          customer: {
            OR: [
              { displayName: { contains: search } },
              { phone: { contains: search } },
            ],
          },
        }
      : {}),
    ...(tierFilter ? { tier: tierFilter } : {}),
  };

  let orderBy: any = { createdAt: "desc" };
  if (sort === "points") orderBy = { points: "desc" };
  if (sort === "visits") orderBy = { visitsCount: "desc" };
  if (sort === "tier") orderBy = { points: "desc" };

  const members = await prisma.membership.findMany({
    where,
    include: {
      customer: { select: { displayName: true, phone: true } },
    },
    orderBy,
    take: 50,
  });

  const tiers = ["regular", "silver", "gold", "platinum"];
  const sorts = [
    { value: "recent", label: "最近加入" },
    { value: "points", label: "积分最高" },
    { value: "visits", label: "到店最多" },
    { value: "tier", label: "等级最高" },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">会员管理</h1>
        {isBusiness && (
          <Link
            href="/business/members/config"
            className="px-2 py-1 text-xs text-[#1A6EFF] border border-[#1A6EFF] rounded-full"
          >
            等级配置
          </Link>
        )}
      </div>

      {/* 搜索栏 */}
      <div className="px-4 pt-3 pb-2">
        <form className="relative">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="搜索姓名或手机号..."
            className="w-full h-9 pl-9 pr-4 rounded-full bg-slate-100 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A6EFF]"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            🔍
          </span>
        </form>
      </div>

      {/* 筛选 + 排序 */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        <form className="flex gap-1.5">
          <input type="hidden" name="search" value={search} />
          <input type="hidden" name="sort" value={sort} />
          {tiers.map((t) => {
            const td = tierDisplay[t];
            return (
              <button
                key={t}
                type="submit"
                name="tier"
                value={tierFilter === t ? "" : t}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  tierFilter === t
                    ? "bg-[#1A6EFF] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {td.label}
              </button>
            );
          })}
        </form>

        <form className="flex gap-1.5 ml-auto">
          <input type="hidden" name="search" value={search} />
          <input type="hidden" name="tier" value={tierFilter} />
          <select
            name="sort"
            defaultValue={sort}
            onChange={(e) => e.target.form?.submit()}
            className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 border-0 focus:outline-none focus:ring-2 focus:ring-[#1A6EFF]"
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </form>
      </div>

      {/* 列表 */}
      <div className="px-4 mt-2 space-y-2">
        {members.map((m) => {
          const td = tierDisplay[m.tier] || tierDisplay.regular;
          return (
            <Link
              key={m.id}
              href={`/business/members/${m.customerId}`}
            >
              <Card className="hover:border-[#1A6EFF]/30">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm">
                      👤
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {m.customer.displayName || "未命名"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {m.customer.phone} · {m.visitsCount}次到店 · ⭐{m.points}
                      </p>
                    </div>
                  </div>
                  <Badge variant={td.variant}>{td.label}</Badge>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {members.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">还没有会员</p>
            {search && <p className="text-xs mt-1">未找到匹配的会员</p>}
          </div>
        )}
      </div>
    </div>
  );
}
