import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { Dice5, Store, Printer } from "lucide-react";
import { parseRulesSnapshot } from "@/lib/templates";
import {
  PhysicalBallotCreateForm,
  type BallotCampaign,
} from "../PhysicalBallotCreateForm";

export default async function PhysicalBallotPage() {
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
        type: "ballot",
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
        type: { in: ["lucky_draw_v2", "lucky_draw"] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        productKind: true,
        catalogProducts: {
          include: {
            product: {
              select: {
                rulesSnapshot: true,
                voucherTiers: true,
                type: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const campaigns: BallotCampaign[] = rawCampaigns.map((camp) => {
    let enabledTiers: number[] = [];
    for (const link of camp.catalogProducts) {
      const p = link.product;
      if (p.status !== "active" && p.status !== "draft") continue;
      const snap = parseRulesSnapshot(p.rulesSnapshot);
      if (Array.isArray(snap?.enabledTiers) && snap!.enabledTiers.length) {
        enabledTiers = (snap!.enabledTiers as number[]).filter(
          (n) => Number.isFinite(n) && n > 0
        );
        break;
      }
      if (p.voucherTiers) {
        try {
          const tiers = JSON.parse(p.voucherTiers) as { min?: number }[];
          enabledTiers = tiers
            .map((t) => Number(t.min))
            .filter((n) => Number.isFinite(n) && n > 0)
            .sort((a, b) => a - b);
          if (enabledTiers.length) break;
        } catch {
          /* ignore */
        }
      }
    }
    if (!enabledTiers.length) enabledTiers = [50, 100];
    return {
      id: camp.id,
      name: camp.name,
      type: camp.type,
      status: camp.status,
      productKind: camp.productKind || undefined,
      enabledTiers,
    };
  });

  return (
    <div className="pb-4 min-h-[60vh]">
      <div className="px-4 py-3.5 border-b border-border/80 sticky top-0 bg-card/95 backdrop-blur-sm z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              {lang === "en" ? "Ballot print (box)" : "入箱票印刷"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {lang === "en"
                ? "Box ritual paper only · not spendable · exclusive 15% · tiers 50/100"
                : "只投抽奖箱 · 不抵消费 · 关联独享 15% · 档位 50/100"}
            </p>
          </div>
          <Link
            href="/business/physical"
            className="text-[11px] text-primary font-medium shrink-0 pt-1 hover:underline flex items-center gap-1"
          >
            <Printer size={12} aria-hidden />
            {lang === "en" ? "Spend paper →" : "消费纸 →"}
          </Link>
        </div>
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
          <PhysicalBallotCreateForm
            stores={stores}
            campaigns={campaigns}
            lang={lang}
            businessName={
              biz?.displayName?.trim() || biz?.businessName
            }
            businessLogo={biz?.businessLogo}
          />
        )}

        <h3 className="text-sm font-semibold text-foreground">
          {lang === "en" ? "Ballot batches" : "入箱票批次"}
        </h3>
        {batches.length === 0 ? (
          <EmptyState
            icon="coupons"
            title={lang === "en" ? "No ballot batches yet" : "暂无入箱票批次"}
            className="py-8"
          />
        ) : (
          batches.map((b) => {
            const printed = b.tickets.filter((t) => t.status === "printed").length;
            const boxed = b.tickets.filter((t) => t.status === "boxed").length;
            return (
              <Link key={b.id} href={`/business/physical/${b.id}`}>
                <Card className="hover:border-brand/30 mb-2 active:scale-[0.98] transition-transform border-border/80 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                          <Dice5
                            size={14}
                            className="text-brand shrink-0"
                            aria-hidden
                          />
                          {b.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 nums">
                          <Store size={11} className="shrink-0" aria-hidden />
                          {b.store.name}
                          {` · S$${formatMoney(b.valueCents)}`}
                          {` · ${b.quantity} 张`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 nums">
                          {lang === "en"
                            ? `Stock ${printed} · Boxed ${boxed}`
                            : `库存 ${printed} · 已投箱 ${boxed}`}
                        </p>
                      </div>
                      <span className="text-xs text-brand font-medium shrink-0 self-center">
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
