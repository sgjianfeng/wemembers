import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Sparkles, Ticket, Flame, MapPin } from "lucide-react";
import { listJoinableActivities } from "@/lib/discover-activities";

export default async function DiscoverActivitiesPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=/discover/draws");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const activities = await listJoinableActivities({
    limit: 50,
    customerId: session.role === "customer" ? session.userId : null,
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-4 border-b border-border">
        <Link
          href="/home"
          className="text-xs font-medium text-primary mb-1 inline-block"
        >
          ← {lang === "en" ? "Home" : "首页"}
        </Link>
        <h1 className="text-lg font-semibold">
          {lang === "en" ? "Activities" : "可参与活动"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lang === "en"
            ? `${activities.length} open`
            : `共 ${activities.length} 个进行中`}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {activities.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="flex justify-center mb-2">
              <Sparkles size={48} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {lang === "en" ? "No activities yet" : "暂无活动"}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {lang === "en"
                ? "Check back when merchants open activities."
                : "商家开放活动后会出现在这里。"}
            </p>
          </div>
        ) : (
          activities.map((d) => {
            const isDraw =
              d.kindTag === "exclusive_draw" ||
              d.kindTag === "co_win_draw" ||
              d.kindTag === "draw";
            const storeNames = d.stores
              .slice(0, 2)
              .map((s) => s.name)
              .join(" · ");
            return (
              <Link key={d.id} href={d.href}>
                <Card className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-100 dark:border-amber-800/50 flex items-center justify-center shrink-0">
                      {isDraw ? (
                        <Sparkles
                          size={20}
                          className="text-amber-600 dark:text-amber-400"
                        />
                      ) : (
                        <Ticket
                          size={20}
                          className="text-amber-600 dark:text-amber-400"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {d.name}
                        </p>
                        {d.hot && (
                          <Flame
                            size={12}
                            className="shrink-0 text-amber-500"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {d.businessName || "—"}
                        {" · "}
                        {lang === "en" ? "Ends" : "截止"}{" "}
                        {new Date(d.endDate).toLocaleDateString(dateLocale)}
                      </p>
                      {(storeNames || d.products.length > 0) && (
                        <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5 flex items-center gap-1">
                          {storeNames && (
                            <>
                              <MapPin size={10} className="shrink-0" />
                              {storeNames}
                              {d.storeCount > 2
                                ? ` +${d.storeCount - 2}`
                                : ""}
                            </>
                          )}
                          {d.products.length > 0 && (
                            <span className="truncate">
                              {storeNames ? " · " : ""}
                              {d.products.length === 1
                                ? d.products[0].name
                                : lang === "en"
                                  ? `${d.products.length} products`
                                  : `${d.products.length} 个产品`}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-primary">
                      {d.joined
                        ? lang === "en"
                          ? "View"
                          : "查看"
                        : lang === "en"
                          ? "Join"
                          : "参与"}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-6 px-4">
        <Link href="/discover/coupons" className="hover:underline">
          {lang === "en"
            ? "Legacy free coupons →"
            : "免费优惠券（旧入口）→"}
        </Link>
      </p>
    </div>
  );
}
