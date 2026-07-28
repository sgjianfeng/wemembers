import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { Ticket, Dice5, Store, Package } from "lucide-react";
import { parseRulesSnapshot } from "@/lib/templates";
import {
  PhysicalBatchCreateForm,
  type PrintableCampaign,
} from "./PhysicalBatchCreateForm";

function productTiers(product: {
  rulesSnapshot: string | null;
  voucherTiers: string | null;
}): number[] {
  const snap = parseRulesSnapshot(product.rulesSnapshot);
  let enabledTiers: number[] = Array.isArray(snap?.enabledTiers)
    ? (snap!.enabledTiers as number[])
    : [];
  if (!enabledTiers.length && product.voucherTiers) {
    try {
      const tiers = JSON.parse(product.voucherTiers) as { min?: number }[];
      enabledTiers = tiers
        .map((t) => Number(t.min))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
    } catch {
      /* ignore */
    }
  }
  return enabledTiers;
}

export default async function PhysicalBatchesPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const [stores, batches, biz, rawCampaigns] = await Promise.all([
    prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.physicalBatch.findMany({
      where: {
        businessId: session.userId,
        type: { in: ["voucher", "draw"] },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        store: { select: { name: true } },
        tickets: { select: { status: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        displayName: true,
        businessName: true,
        businessLogo: true,
      },
    }),
    prisma.campaign.findMany({
      where: {
        businessId: session.userId,
        status: { in: ["active", "draft"] },
        endDate: { gte: new Date() },
        productKind: "self_use",
        role: "activity",
        type: {
          in: ["voucher_sale", "lucky_draw_v2", "lucky_draw", "promotion"],
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        productKind: true,
        catalogProducts: {
          orderBy: { sortOrder: "asc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                type: true,
                productKind: true,
                status: true,
                description: true,
                rulesSnapshot: true,
                voucherTiers: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const campaigns: PrintableCampaign[] = rawCampaigns
    .map((camp) => {
      const products = camp.catalogProducts
        .map((link) => link.product)
        .filter(
          (p) =>
            p.status === "active" ||
            p.status === "draft"
        )
        .map((p) => {
          const snap = parseRulesSnapshot(p.rulesSnapshot);
          const packKind =
            snap && typeof (snap as { packKind?: string }).packKind === "string"
              ? (snap as { packKind?: string }).packKind
              : null;
          return {
            id: p.id,
            name: p.name,
            type: p.type,
            productKind: p.productKind,
            status: p.status,
            description: p.description,
            enabledTiers: productTiers(p),
            packKind,
          };
        });
      // Prefer campaigns that have sellable products; also allow campaign-as-product fallback
      if (products.length === 0) {
        // Fallback: use campaign itself as a synthetic product for legacy data
        const isDraw =
          camp.type === "lucky_draw_v2" || camp.type === "lucky_draw";
        products.push({
          id: `campaign:${camp.id}`,
          name: camp.name,
          type: isDraw ? "lucky_draw_v2" : "voucher_sale",
          productKind: camp.productKind || "self_use",
          status: camp.status,
          description: null,
          enabledTiers: isDraw ? [50, 100] : [10, 20, 50, 100, 200],
          packKind: isDraw ? "exclusive_ballot" : null,
        });
      }
      return {
        id: camp.id,
        name: camp.name,
        type: camp.type,
        status: camp.status,
        productKind: camp.productKind || undefined,
        products,
      };
    })
    .filter((c) => c.products.length > 0);

  return (
    <div className="pb-4 min-h-[60vh]">
      <div className="px-4 py-3.5 border-b border-border/80 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">
          {lang === "en" ? "Physical print" : "实体印刷"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {lang === "en"
            ? "Activity → product → paper. Front footer: 2 short lines; longer rules on the back."
            : "活动 → 产品 → 纸质。条款正面小字两行；过长可印背面。"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {lang === "en" ? (
            <>
              Need box ballots?{" "}
              <Link
                href="/business/physical/ballot"
                className="text-brand font-medium hover:underline"
              >
                Ballot print →
              </Link>
            </>
          ) : (
            <>
              需要投箱票？{" "}
              <Link
                href="/business/physical/ballot"
                className="text-brand font-medium hover:underline"
              >
                入箱票印刷 →
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {stores.length === 0 ? (
          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-4 text-sm text-muted-foreground">
              {lang === "en" ? (
                <>
                  Add a store first.{" "}
                  <Link href="/business/stores" className="text-primary font-medium">
                    Stores →
                  </Link>
                </>
              ) : (
                <>
                  请先添加门店。{" "}
                  <Link href="/business/stores" className="text-primary font-medium">
                    去门店 →
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <PhysicalBatchCreateForm
            stores={stores}
            campaigns={campaigns}
            lang={lang}
            businessName={
              biz?.displayName?.trim() || biz?.businessName
            }
            businessLogo={biz?.businessLogo}
          />
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <h3 className="text-sm font-semibold text-foreground">
            {lang === "en" ? "Print batches" : "印刷批次"}
          </h3>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Package size={12} aria-hidden />
            {lang === "en" ? "Voucher / draw paper" : "自用 / 抽奖消费纸"}
          </span>
        </div>

        {batches.length === 0 ? (
          <EmptyState
            icon="coupons"
            title={lang === "en" ? "No batches yet" : "暂无批次"}
            className="py-8"
          />
        ) : (
          batches.map((b) => {
            const claimed = b.tickets.filter((t) => t.status === "claimed").length;
            const redeemed = b.tickets.filter((t) => t.status === "redeemed").length;
            const printed = b.tickets.filter((t) => t.status === "printed").length;
            const sold = b.tickets.filter((t) => t.status === "sold").length;
            return (
              <Link key={b.id} href={`/business/physical/${b.id}`}>
                <Card className="hover:border-primary/30 mb-2 active:scale-[0.98] transition-transform border-border/80 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                          {b.type === "draw" ? (
                            <Dice5
                              size={14}
                              className="text-brand shrink-0"
                              aria-hidden
                            />
                          ) : (
                            <Ticket
                              size={14}
                              className="text-primary shrink-0"
                              aria-hidden
                            />
                          )}
                          {b.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 nums">
                          <Store size={11} className="shrink-0" aria-hidden />
                          {b.store.name}
                          {b.type === "voucher"
                            ? ` · S$${formatMoney(b.valueCents)}`
                            : " · 抽奖"}
                          {` · ${b.quantity} 张`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 nums">
                          {lang === "en"
                            ? `Stock ${printed} · Sold ${sold} · Bound ${claimed} · Used ${redeemed}`
                            : `库存 ${printed} · 已售 ${sold} · 已绑 ${claimed} · 已核 ${redeemed}`}
                        </p>
                      </div>
                      <span className="text-xs text-primary font-medium shrink-0 self-center">
                        {lang === "en" ? "Print →" : "印刷 →"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
