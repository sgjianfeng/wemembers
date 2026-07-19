import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { SettingsEditForm } from "./SettingsEditForm";
import { BrandLogoUpload } from "./BrandLogoUpload";
import Link from "next/link";

export default async function BusinessSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      businessName: true,
      businessLogo: true,
      businessSlug: true,
      businessUen: true,
      businessCategory: true,
      email: true,
      phone: true,
      displayName: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/api/auth/logout?next=/auth/login");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const firstStore = await prisma.store.findFirst({
    where: { businessId: session.userId },
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  const shopUrl = user.businessSlug
    ? firstStore
      ? `${appUrl}/shop/${user.businessSlug}/${firstStore.slug}`
      : `${appUrl}/shop/${user.businessSlug}`
    : null;

  return (
    <div className="pb-4 overflow-x-hidden max-w-full">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">
          {t("business.settings.title", lang)}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Legal entity & brand — stores are managed separately"
            : "公司主体与品牌信息 · 门店请在「门店」中管理"}
        </p>
      </div>

      <div className="px-4 mt-4 space-y-4 min-w-0 max-w-full">
        <BrandLogoUpload
          lang={lang}
          initialUrl={user.businessLogo || null}
        />

        <SettingsEditForm
          shopBaseUrl={appUrl}
          initial={{
            businessName: user.businessName || "",
            businessSlug: user.businessSlug || "",
            businessUen: user.businessUen || "",
            businessCategory: user.businessCategory || "",
            displayName: user.displayName || "",
            phone: user.phone || "",
            email: user.email || "",
          }}
        />

        <Card className="min-w-0 overflow-hidden">
          <CardContent className="p-4 space-y-2 text-sm min-w-0">
            <Info
              label={t("business.settings.registeredAt", lang)}
              value={user.createdAt.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}
            />
            <Link href="/business/stores" className="block text-xs text-[#1A6EFF] pt-1">
              {lang === "en" ? "Manage stores →" : "管理门店 →"}
            </Link>
            <Link href="/business/tokens" className="block text-xs text-[#1A6EFF]">
              {lang === "en" ? "Wallet & withdraw →" : "账户与提现 →"}
            </Link>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardContent className="p-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              {t("business.settings.qrCode", lang)}
            </h3>
            <p className="text-xs text-slate-500 mb-4">{t("business.settings.qrHint", lang)}</p>

            {shopUrl ? (
              <div className="space-y-4 min-w-0">
                <div className="flex justify-center">
                  <div className="w-48 h-48 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/shop/qr?size=192`}
                      alt={t("business.settings.qrAlt", lang)}
                      className="w-full h-full"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 min-w-0">
                  <p className="text-xs text-slate-400 mb-1">
                    {t("business.settings.shopUrl", lang)}
                  </p>
                  <p className="text-sm font-mono text-slate-700 break-all">{shopUrl}</p>
                </div>

                <div className="p-3 bg-[#1A6EFF]/5 rounded-xl min-w-0">
                  <h4 className="text-xs font-semibold text-[#1A6EFF] mb-2">
                    {t("business.settings.usageTitle", lang)}
                  </h4>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>{t("business.settings.usage1", lang)}</li>
                    <li>{t("business.settings.usage2", lang)}</li>
                    <li>{t("business.settings.usage3", lang)}</li>
                    <li>{t("business.settings.usage4", lang)}</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p className="text-3xl mb-2">🔗</p>
                <p className="text-sm">{t("business.settings.slugNotGenerated", lang)}</p>
                <p className="text-xs mt-1">{t("business.settings.contactAdmin", lang)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 min-w-0">
      <span className="text-slate-400 text-xs shrink-0">{label}</span>
      <span className="text-slate-900 text-xs font-medium text-right break-all min-w-0">
        {value}
      </span>
    </div>
  );
}
