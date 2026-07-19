import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { PhysicalBatchCreateForm } from "./PhysicalBatchCreateForm";

export default async function PhysicalBatchesPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const [stores, batches, biz, campaigns] = await Promise.all([
    prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.physicalBatch.findMany({
      where: { businessId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        store: { select: { name: true } },
        tickets: { select: { status: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { businessName: true, businessLogo: true },
    }),
    prisma.campaign.findMany({
      where: {
        businessId: session.userId,
        status: { in: ["active", "draft"] },
        endDate: { gte: new Date() },
      },
      select: { id: true, name: true, type: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">
          {lang === "en" ? "Physical tickets" : "实体券印刷"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Print store-only vouchers / draw tickets · customers scan to bind"
            : "本店印刷代金/抽奖券 · 顾客扫码绑定 · 一次用完"}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {stores.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-slate-500">
              {lang === "en" ? (
                <>
                  Add a store first.{" "}
                  <Link href="/business/stores" className="text-[#1A6EFF]">
                    Stores →
                  </Link>
                </>
              ) : (
                <>
                  请先添加门店。{" "}
                  <Link href="/business/stores" className="text-[#1A6EFF]">
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
            businessName={biz?.businessName}
            businessLogo={biz?.businessLogo}
          />
        )}

        <h3 className="text-sm font-semibold text-slate-900">
          {lang === "en" ? "Batches" : "印刷批次"}
        </h3>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            {lang === "en" ? "No batches yet" : "暂无批次"}
          </p>
        ) : (
          batches.map((b) => {
            const claimed = b.tickets.filter((t) => t.status === "claimed").length;
            const redeemed = b.tickets.filter((t) => t.status === "redeemed").length;
            const printed = b.tickets.filter((t) => t.status === "printed").length;
            return (
              <Link key={b.id} href={`/business/physical/${b.id}`}>
                <Card className="hover:border-[#1A6EFF]/30 mb-2">
                  <CardContent className="p-4">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {b.type === "draw" ? "🎰 " : "🎫 "}
                          {b.title}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          🏪 {b.store.name}
                          {b.type === "voucher"
                            ? ` · S$${formatMoney(b.valueCents)}`
                            : " · 抽奖"}
                          {` · ${b.quantity} 张`}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {lang === "en"
                            ? `Open ${printed} · Bound ${claimed} · Used ${redeemed}`
                            : `未用 ${printed} · 已绑 ${claimed} · 已核 ${redeemed}`}
                        </p>
                      </div>
                      <span className="text-xs text-[#1A6EFF] font-medium shrink-0">
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
