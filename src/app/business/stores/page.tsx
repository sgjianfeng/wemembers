import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StoreCreateForm } from "./StoreCreateForm";

export default async function StoresPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    include: {
      staff: { select: { id: true, displayName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">{t("business.stores.title", lang)}</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <StoreCreateForm />

        {stores.map((store) => {
          const origin =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const storeUrl = `${origin}/store/${store.slug}`;
          return (
            <Card key={store.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      🏪 {store.name}
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
                    className="w-20 h-20 rounded-lg border"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-mono break-all mb-2">
                  {storeUrl}
                </p>
                {store.staff.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {store.staff.map((s) => (
                      <Badge key={s.id} variant="slate" size="sm">
                        {s.displayName || s.phone}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t("business.stores.noStaff", lang)}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
