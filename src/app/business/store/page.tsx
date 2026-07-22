import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveStoreLogo } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { StoreQrActions } from "@/app/business/stores/[id]/StoreQrActions";
import Link from "next/link";

export default async function StoreSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "staff" || !session.storeId)
    redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    include: {
      business: {
        select: { businessSlug: true, businessName: true, businessLogo: true },
      },
    },
  });
  if (!store)
    return (
      <div className="p-8 text-center text-slate-400">
        {lang === "en" ? "Store not found" : "门店不存在"}
      </div>
    );

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const storeUrl = store.business.businessSlug
    ? `${origin}/shop/${store.business.businessSlug}/${store.slug}`
    : `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">
          {lang === "en" ? "This store" : "本店信息"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Redeem-only access · fixed to this outlet"
            : "仅核销权限 · 固定本店"}
        </p>
      </div>
      <div className="px-4 mt-4 space-y-4">
        <Card>
          <CardContent className="p-4 flex gap-3 items-start">
            <BrandAvatar
              src={resolveStoreLogo(null, store.business.businessLogo)}
              name={store.name}
              size={56}
              rounded="xl"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                {store.name}
              </h3>
              {store.business.businessName && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {store.business.businessName}
                </p>
              )}
              {store.address && (
                <p className="text-xs text-slate-500 mt-1">📍 {store.address}</p>
              )}
              {store.phone && (
                <p className="text-xs text-slate-500">📞 {store.phone}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {lang === "en" ? "Store QR" : "本店二维码"}
            </h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              {lang === "en"
                ? "Customers scan to open this store’s deals page."
                : "顾客扫码进入本店优惠页（与实体券 PT- 码不同）。"}
            </p>
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/store/qr?storeId=${store.id}&size=192`}
                  alt="门店二维码"
                  className="w-full h-full"
                />
              </div>
            </div>
            <div className="mt-3 bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">
                {lang === "en" ? "Customer link" : "本店链接"}
              </p>
              <p className="text-sm font-mono text-slate-700 break-all">
                {storeUrl}
              </p>
            </div>
            <StoreQrActions
              storeId={store.id}
              storeName={store.name}
              publicUrl={storeUrl}
              address={store.address}
              lang={lang}
              variant="staff"
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/business/scan">
            <Card className="bg-[#1A6EFF] border-0">
              <CardContent className="p-3 text-white">
                <p className="text-lg">📷</p>
                <p className="text-sm font-semibold mt-1">
                  {lang === "en" ? "Redeem" : "去核销"}
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/business">
            <Card className="hover:border-[#1A6EFF]/30">
              <CardContent className="p-3">
                <p className="text-lg">📊</p>
                <p className="text-sm font-semibold mt-1 text-slate-900">
                  {lang === "en" ? "Dashboard" : "工作台"}
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="p-4 bg-[#1A6EFF]/5 rounded-xl">
          <h4 className="text-xs font-semibold text-[#1A6EFF] mb-2">
            {lang === "en" ? "Staff tips" : "店员操作"}
          </h4>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>
              •{" "}
              {lang === "en"
                ? "Redeem: vouchers / paper tickets (Paper tab)"
                : "核销：预付券 / 实体券（核销页「实体券」Tab）"}
            </li>
            <li>
              •{" "}
              {lang === "en"
                ? "Print store QR for counter (not paper vouchers)"
                : "打印本店二维码贴台（不是实体券 PT-）"}
            </li>
            <li>
              •{" "}
              {lang === "en"
                ? "Cannot manage coupons / campaigns / settings"
                : "不能管理券、活动、企业设置"}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
