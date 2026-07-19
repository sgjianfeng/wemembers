import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StoreCreateForm } from "./StoreCreateForm";
import Link from "next/link";

export default async function StoresPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const business = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { businessSlug: true, businessName: true },
  });

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    include: {
      staff: { select: { id: true, displayName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const companySlug = business?.businessSlug;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">{t("business.stores.title", lang)}</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Company products are enabled per store. Staff redeem at their store."
            : "企业创建券/活动；门店选择启用。店员在本店核销。"}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {stores.length === 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {lang === "en"
                ? "Add your first store"
                : "注册完成 · 请添加第一家门店"}
            </p>
            <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
              {lang === "en"
                ? "HQ sets Stripe & products. Stores get QR codes and staff redeem."
                : "总部设置 Stripe 与产品；门店有独立二维码与店员核销入口。"}
            </p>
          </div>
        )}

        <StoreCreateForm />

        {stores.map((store) => {
          const storeUrl = companySlug
            ? `${origin}/shop/${companySlug}/${store.slug}`
            : `${origin}/store/${store.slug}`;
          return (
            <Card key={store.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-sm font-semibold text-slate-900">
                      🏪 {store.name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {companySlug ? `${companySlug}/${store.slug}` : store.slug}
                    </p>
                    {store.address && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        📍 {store.address}
                      </p>
                    )}
                    {store.phone && (
                      <p className="text-xs text-slate-400">
                        📞 {store.phone}
                      </p>
                    )}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/store/qr?storeId=${store.id}&size=80`}
                    alt="QR"
                    className="w-20 h-20 rounded-lg border shrink-0"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-mono break-all mb-2">
                  {storeUrl}
                </p>
                {store.staff.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {store.staff.map((s) => (
                      <Badge key={s.id} variant="slate" size="sm">
                        {s.displayName || s.phone}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mb-3">
                    {t("business.stores.noStaff", lang)}
                  </p>
                )}
                <Link
                  href={`/business/stores/${store.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[#1A6EFF] px-4 text-xs font-semibold text-white w-full"
                >
                  {lang === "en" ? "Enter store →" : "进入门店 →"}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
