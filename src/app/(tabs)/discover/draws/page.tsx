import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Sparkles, Ticket, Flame, MapPin, Trophy } from "lucide-react";
import {
  listJoinableActivities,
  offerCta,
  offerKindLabel,
  offerBlurb,
} from "@/lib/discover-activities";

export default async function DiscoverOffersPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?redirect=/discover/draws");

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";
  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  const activities = await listJoinableActivities({
    limit: 50,
    customerId: session.role === "customer" ? session.userId : null,
    listScope: "hot",
  });

  const vouchers = activities.filter((a) => a.displayMode === "voucher");
  const draws = activities.filter((a) => a.displayMode === "draw");

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
          {lang === "en" ? "Offers" : "优惠"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lang === "en"
            ? `${vouchers.length} store credit · ${draws.length} prize draws`
            : `${vouchers.length} 个到店代金 · ${draws.length} 个抽奖`}
        </p>
      </div>

      <div className="px-4 mt-3 space-y-4">
        {activities.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="flex justify-center mb-2">
              <Sparkles size={48} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {lang === "en" ? "No offers yet" : "暂无优惠"}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {lang === "en"
                ? "Check back when stores list vouchers or prize draws."
                : "门店上架代金券或抽奖后会出现在这里。"}
            </p>
          </div>
        ) : (
          <>
            {vouchers.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground px-0.5">
                  {lang === "en" ? "Store credit" : "到店代金"}
                </h2>
                {vouchers.map((d) => (
                  <OfferCard key={d.id} d={d} lang={lang} dateLocale={dateLocale} />
                ))}
              </section>
            )}
            {draws.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground px-0.5">
                  {lang === "en" ? "Prize draws" : "抽奖"}
                </h2>
                {draws.map((d) => (
                  <OfferCard key={d.id} d={d} lang={lang} dateLocale={dateLocale} />
                ))}
              </section>
            )}
          </>
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

function OfferCard({
  d,
  lang,
  dateLocale,
}: {
  d: Awaited<ReturnType<typeof listJoinableActivities>>[number];
  lang: "zh" | "en";
  dateLocale: string;
}) {
  const isDraw = d.displayMode === "draw";
  const storeNames = d.stores
    .slice(0, 2)
    .map((s) => s.name)
    .join(" · ");
  return (
    <Link href={d.href}>
      <Card
        className={
          isDraw
            ? "hover:border-amber-400/40 transition-colors"
            : "hover:border-primary/30 transition-colors"
        }
      >
        <CardContent className="p-3 flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
              isDraw
                ? "bg-amber-50 dark:bg-amber-950/35 border-amber-100 dark:border-amber-800/50"
                : "bg-primary/10 border-primary/15"
            }`}
          >
            {isDraw ? (
              <Trophy
                size={20}
                className="text-amber-600 dark:text-amber-400"
              />
            ) : (
              <Ticket size={20} className="text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground">
                {offerKindLabel(d.kindTag, lang)}
              </span>
              {d.hot && (
                <Flame size={12} className="shrink-0 text-amber-500" />
              )}
            </div>
            <p className="text-sm font-semibold text-foreground truncate">
              {d.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {d.businessName || "—"}
              {" · "}
              {lang === "en" ? "Until" : "至"}{" "}
              {new Date(d.endDate).toLocaleDateString(dateLocale)}
            </p>
            <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
              {offerBlurb(d, lang)}
              {storeNames
                ? ` · ${storeNames}${
                    d.storeCount > 2 ? ` +${d.storeCount - 2}` : ""
                  }`
                : ""}
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-primary">
            {offerCta(d, lang)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
