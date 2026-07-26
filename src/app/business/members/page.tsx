import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { cookies } from "next/headers";
import { t, Lang } from "@/lib/i18n";
import { Search, User, Star } from "lucide-react";

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

  const c = await cookies();
  const lang: Lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const isBusiness = session.role === "business";

  // 店员 JWT 的 userId 是店员本人，会员属于企业 businessId
  let businessId = session.userId;
  if (session.role === "staff") {
    if (!session.storeId) redirect("/auth/login");
    const st = await prisma.store.findUnique({
      where: { id: session.storeId },
      select: { businessId: true },
    });
    if (!st) redirect("/auth/login");
    businessId = st.businessId;
  }

  const tierDisplay: Record<string, { label: string; variant: "slate" | "amber" | "purple" | "blue" }> = {
    regular: { label: t("business.members.filterRegular", lang), variant: "slate" },
    silver: { label: t("business.members.filterSilver", lang), variant: "blue" },
    gold: { label: t("business.members.filterGold", lang), variant: "amber" },
    platinum: { label: t("business.members.filterPlatinum", lang), variant: "purple" },
  };

  const where: any = {
    businessId,
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
    { value: "recent", label: t("business.members.sortRecent", lang) },
    { value: "points", label: t("business.members.sortPoints", lang) },
    { value: "visits", label: t("business.members.sortVisits", lang) },
    { value: "tier", label: t("business.members.sortTier", lang) },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
        <h1 className="text-lg font-semibold text-foreground">{t("business.members.title", lang)}</h1>
        {isBusiness && (
          <Link
            href="/business/members/config"
            className="px-2 py-1 text-xs text-primary border border-primary rounded-full active:scale-[0.97] transition-transform"
          >
            {t("business.members.tierConfig", lang)}
          </Link>
        )}
      </div>

      {/* search bar */}
      <div className="px-4 pt-3 pb-2">
        <form className="relative">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder={t("business.members.search", lang)}
            className="w-full h-9 pl-9 pr-4 rounded-full bg-muted text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </form>
      </div>

      {/* filter + sort */}
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
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-[0.97] ${
                  tierFilter === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {td.label}
              </button>
            );
          })}
        </form>

        <form method="get" className="flex gap-1.5 ml-auto items-center">
          <input type="hidden" name="search" value={search} />
          <input type="hidden" name="tier" value={tierFilter} />
          <select
            name="sort"
            defaultValue={sort}
            className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground border-0 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {sorts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/70 active:scale-[0.97] transition-transform"
          >
            {lang === "en" ? "Sort" : "排序"}
          </button>
        </form>
      </div>

      {/* list */}
      <div className="px-4 mt-2 space-y-2">
        {members.map((m) => {
          const td = tierDisplay[m.tier] || tierDisplay.regular;
          return (
            <Link
              key={m.id}
              href={`/business/members/${m.customerId}`}
            >
              <Card className="hover:border-primary/30 active:scale-[0.98] transition-transform">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <User size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.customer.displayName || t("business.members.unnamed", lang)}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 nums">
                        {m.customer.phone} · {m.visitsCount}{t("business.members.visits", lang)}
                        {" · "}
                        <Star size={11} className="inline -mt-0.5" /> {m.points}
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
          <EmptyState
            icon="members"
            title={t("business.members.noMembers", lang)}
            description={search ? t("business.members.notFound", lang) : undefined}
            className="py-12"
          />
        )}
      </div>
    </div>
  );
}
