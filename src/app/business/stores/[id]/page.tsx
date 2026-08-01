import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { resolveStoreLogo, timeAgo } from "@/lib/utils";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import { StoreEditForm } from "./StoreEditForm";
import { StoreQrActions } from "./StoreQrActions";
import { StoreStaffForm } from "./StoreStaffForm";
import { StoreCatalogPanel } from "./StoreCatalogPanel";

/**
 * 企业后台 → 进入具体门店
 * 店务入口：核销、二维码、店员、本店数据
 */
export default async function BusinessStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const store = await prisma.store.findFirst({
    where: { id, businessId: session.userId },
    include: {
      staff: { select: { id: true, displayName: true, phone: true } },
      business: {
        select: {
          businessSlug: true,
          businessName: true,
          businessLogo: true,
        },
      },
    },
  });
  if (!store) notFound();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [redeemsToday, recent] = await Promise.all([
    prisma.voucherUsage.count({
      where: {
        storeId: store.id,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.voucherUsage.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        voucher: { select: { campaign: { select: { name: true } } } },
      },
    }),
  ]);

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = store.business.businessSlug
    ? `${origin}/shop/${store.business.businessSlug}/${store.slug}`
    : `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-3">
          <Link href="/business" className="text-xs text-primary font-medium">
            ← {lang === "en" ? "Company" : "企业后台"}
          </Link>
          <Link
            href="/business/stores"
            className="text-xs text-muted-foreground font-medium"
          >
            {lang === "en" ? "All stores" : "全部门店"}
          </Link>
        </div>
        <div className="flex items-start gap-3 mt-2">
          <BrandAvatar
            src={resolveStoreLogo(null, store.business.businessLogo)}
            name={store.name}
            size={48}
            rounded="2xl"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {store.name}
            </h1>
            {store.address ? (
              <p className="text-xs text-muted-foreground mt-0.5">📍 {store.address}</p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {lang === "en"
                  ? "No address yet — add unit number below"
                  : "尚未填写地址 — 请在下方编辑门牌"}
              </p>
            )}
            {store.phone && (
              <p className="text-xs text-muted-foreground mt-0.5">📞 {store.phone}</p>
            )}
            <p className="text-[10px] text-muted-foreground font-mono mt-1 break-all">
              {store.business.businessSlug
                ? `${store.business.businessSlug}/${store.slug}`
                : store.slug}
            </p>
          </div>
        </div>
        <div className="mt-2">
          <StoreEditForm
            storeId={store.id}
            lang={lang}
            initial={{
              name: store.name,
              address: store.address || "",
              phone: store.phone || "",
            }}
          />
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <Card className="bg-muted/50 border-0">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-foreground">{redeemsToday}</p>
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? "Redeems today" : "今日核销"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-0">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-foreground">
              {store.staff.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? "Staff" : "店员"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-4">
        <StoreCatalogPanel storeId={store.id} />
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`/business/offers?storeId=${encodeURIComponent(store.id)}`}
          className="col-span-2"
        >
          <Card className="bg-rose-600 border-0">
            <CardContent className="p-3 text-white">
              <p className="text-lg">🎁</p>
              <p className="text-sm font-semibold mt-1">
                {lang === "en" ? "This store · Activity perks" : "本店活动券"}
              </p>
              <p className="text-[10px] text-white/85 mt-0.5">
                {lang === "en"
                  ? "Activity gift desk · generic scan · store locked"
                  : "活动满赠台 · 通用核销 · 门店已锁定"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/business/scan?storeId=${store.id}`}>
          <Card className="bg-primary border-0">
            <CardContent className="p-3 text-white">
              <p className="text-lg">📷</p>
              <p className="text-sm font-semibold mt-1">
                {lang === "en" ? "Redeem here" : "本店核销"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link
          href={`/business/ndp-desk?storeId=${encodeURIComponent(store.id)}`}
        >
          <Card className="border-rose-200 bg-rose-50 dark:bg-rose-950/30">
            <CardContent className="p-3">
              <p className="text-lg">🇸🇬</p>
              <p className="text-sm font-semibold mt-1 text-foreground">
                {lang === "en" ? "Gift desk" : "活动满赠台"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <a href={publicUrl} target="_blank" rel="noreferrer">
          <Card className="hover:border-primary/30">
            <CardContent className="p-3">
              <p className="text-lg">🔗</p>
              <p className="text-sm font-semibold mt-1 text-foreground">
                {lang === "en" ? "Customer page" : "顾客页"}
              </p>
            </CardContent>
          </Card>
        </a>
        <Link href="/business/physical">
          <Card className="hover:border-primary/30">
            <CardContent className="p-3">
              <p className="text-lg">🖨️</p>
              <p className="text-sm font-semibold mt-1 text-foreground">
                {lang === "en" ? "Print tickets" : "印实体券"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-4 items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/store/qr?storeId=${store.id}&size=160`}
                alt="QR"
                className="w-28 h-28 rounded-xl border shrink-0 bg-card"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? "Store QR (customer entry)" : "本店二维码（顾客入口）"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {lang === "en"
                    ? "Place at counter. Scan opens this store’s deals page — not the same as paper vouchers."
                    : "放吧台/桌面。扫码进入本店顾客页（领券/活动），与实体券 PT- 码不同。"}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground break-all mt-2">
                  {publicUrl}
                </p>
              </div>
            </div>
            <StoreQrActions
              storeId={store.id}
              storeName={store.name}
              publicUrl={publicUrl}
              address={store.address}
              lang={lang}
            />
          </CardContent>
        </Card>
      </div>

      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">
            {lang === "en" ? "Staff" : "店员"}
          </h3>
          <StoreStaffForm storeId={store.id} lang={lang} />
        </div>
        {store.staff.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? "No staff yet. Add a phone + password for redeem-only login."
              : "暂无店员。添加手机号+密码后，对方登录进本店核销。"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {store.staff.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm"
              >
                <span className="font-medium text-foreground">
                  {s.displayName || (lang === "en" ? "Staff" : "店员")}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {s.phone}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          {lang === "en"
            ? "Staff login: Business tab → phone + password. Can redeem only at this store."
            : "店员登录：登录页选「商家」→ 手机号+密码。只能本店核销，不能管券/活动/设置。"}
        </p>
      </div>

      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {lang === "en" ? "Recent redeems" : "本店最近核销"}
        </h3>
        {recent.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            {lang === "en" ? "No activity yet" : "暂无记录"}
          </p>
        ) : (
          recent.map((u) => (
            <div
              key={u.id}
              className="flex justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm mb-1"
            >
              <span className="truncate text-muted-foreground">
                {u.voucher.campaign?.name || "—"} · +S$
                {(u.storeIncome / 100).toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {timeAgo(u.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
