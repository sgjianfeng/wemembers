import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getJoinableActivityById } from "@/lib/discover-activities";
import { Card, CardContent } from "@/components/ui/Card";
import { MapPin, Ticket, ChevronRight, Flame } from "lucide-react";

/**
 * Multi-product activity landing — pick a product to buy.
 * Single-product activities deep-link straight to /voucher/[slug].
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
        <p className="text-sm text-muted-foreground mt-1">
          {activity.businessName}
        </p>
        {activity.description && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
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
          {lang === "en" ? "Pick a product" : "选择要参与的产品"}
        </h2>
        <p className="text-[11px] text-muted-foreground -mt-1">
          {lang === "en"
            ? "This activity includes multiple voucher products. Choose one to buy."
            : "本活动包含多个券产品，请选择一条线购买/参与。"}
        </p>

        {activity.products.map((p) => (
          <Link
            key={p.id}
            href={p.buyPath || `/voucher/${p.slug || p.id}`}
            className="block active:scale-[0.99] transition-transform"
          >
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Ticket size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.type === "lucky_draw_v2"
                      ? lang === "en"
                        ? "Draw voucher"
                        : "抽奖券"
                      : lang === "en"
                        ? "Voucher"
                        : "代金券"}
                    {p.productKind === "self_use"
                      ? lang === "en"
                        ? " · Self-use"
                        : " · 自用"
                      : lang === "en"
                        ? " · Network"
                        : " · 分发"}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  {lang === "en" ? "Buy" : "去购买"}
                  <ChevronRight size={16} />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
