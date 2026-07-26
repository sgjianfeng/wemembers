import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  getJoinableActivityById,
  offerBlurb,
  offerKindLabel,
} from "@/lib/discover-activities";
import { Card, CardContent } from "@/components/ui/Card";
import { MapPin, Ticket, ChevronRight, Flame, Trophy } from "lucide-react";

/**
 * Multi-product offer landing — pick a product to buy / enter.
 * Single-product offers deep-link straight to /voucher/[slug].
 */
export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const customerId =
    session?.role === "customer" ? session.userId : null;

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const activity = await getJoinableActivityById(id, customerId);
  if (!activity) notFound();

  // If only one product, skip this page
  if (activity.products.length === 1) {
    const p = activity.products[0];
    redirect(p.buyPath || `/voucher/${p.slug || activity.id}`);
  }
  if (activity.products.length === 0) {
    redirect(`/voucher/${activity.slug || activity.id}`);
  }

  const storeText =
    activity.storeCount === 0
      ? lang === "en"
        ? "Stores TBA"
        : "门店待定"
      : activity.stores
          .slice(0, 4)
          .map((s) => s.name)
          .join(" · ") +
        (activity.storeCount > 4
          ? lang === "en"
            ? ` +${activity.storeCount - 4}`
            : ` 等${activity.storeCount}家`
          : "");

  return (
    <div className="min-h-screen pb-10 bg-background">
      <div className="px-4 py-4 border-b border-border bg-card">
        <Link
          href={session ? "/home" : "/"}
          className="text-xs font-medium text-primary"
        >
          ← {lang === "en" ? "Back" : "返回"}
        </Link>
        <div className="flex items-start gap-2 mt-2">
          <h1 className="text-xl font-bold text-foreground flex-1">
            {activity.name}
          </h1>
          {activity.hot && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold">
              <Flame size={12} />
              {lang === "en" ? "HOT" : "热门"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <span>{activity.businessName}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
            {offerKindLabel(activity.kindTag, lang)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          {offerBlurb(activity, lang)}
        </p>
        {activity.description && (
          <p className="text-xs text-muted-foreground/80 mt-1.5 leading-relaxed">
            {activity.description}
          </p>
        )}
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-3">
          <MapPin size={14} className="shrink-0 mt-0.5" />
          <span>{storeText}</span>
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          {activity.displayMode === "draw"
            ? lang === "en"
              ? "Choose how to enter"
              : "选择参与方式"
            : lang === "en"
              ? "Choose a voucher"
              : "选择要买的代金"}
        </h2>
        <p className="text-[11px] text-muted-foreground -mt-1">
          {activity.displayMode === "draw"
            ? lang === "en"
              ? "This offer has more than one option. Pick one to buy and enter."
              : "该抽奖有多个档位/产品，选一个购买即可参与。"
            : lang === "en"
              ? "Pick a credit option to buy and spend at the store."
              : "选一档到店代金购买，到店核销使用。"}
        </p>

        {activity.products.map((p) => {
          const isDrawProd = p.type === "lucky_draw_v2" || p.type === "lucky_draw";
          return (
            <Link
              key={p.id}
              href={p.buyPath || `/voucher/${p.slug || p.id}`}
              className="block active:scale-[0.99] transition-transform"
            >
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                      isDrawProd
                        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {isDrawProd ? <Trophy size={20} /> : <Ticket size={20} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isDrawProd
                        ? lang === "en"
                          ? "Prize draw option"
                          : "抽奖档"
                        : lang === "en"
                          ? "Store credit"
                          : "到店代金"}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                    {isDrawProd
                      ? lang === "en"
                        ? "Enter"
                        : "去抽奖"
                      : lang === "en"
                        ? "Buy"
                        : "去购买"}
                    <ChevronRight size={16} />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
