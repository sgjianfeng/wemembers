import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandAvatar } from "@/components/ui/BrandAvatar";
import Link from "next/link";
import { resolveStoreLogo, timeAgo } from "@/lib/utils";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { resolveStaffStore } from "@/lib/current-store";
import { Store, Users, ShoppingCart, Sparkles, Wrench, Coins, MailOpen, Calendar, ScanLine, Banknote, QrCode, Trophy, Ticket } from "lucide-react";

/**
 * /business
 * - business：公司 Dashboard（汇总 + 入口）
 * - staff：直接本店工作台（无「当前门店」概念）
 */
export default async function BusinessDashboard() {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // ── 店员：本店页 ──
  if (session.role === "staff") {
    return <StaffStoreHome sessionStoreId={session.storeId} lang={lang} />;
  }

  // ── 企业：公司 Dashboard ──
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      businessName: true,
      businessLogo: true,
      tokenAccount: { select: { balance: true } },
    },
  });
  if (!user) redirect("/api/auth/logout?next=/auth/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const stores = await prisma.store.findMany({
    where: { businessId: user.id },
    select: { id: true, name: true, slug: true, address: true },
    orderBy: { createdAt: "asc" },
  });

  const storeIds = stores.map((s) => s.id);

  const [
    memberCount,
    activeCampaignCount,
    salesToday,
    redeemsToday,
    recentVoucherUsages,
    recentSales,
  ] = await Promise.all([
    prisma.membership.count({ where: { businessId: user.id } }),
    prisma.campaign.count({
      where: {
        businessId: user.id,
        status: "active",
        type: { in: ["lucky_draw_v2", "voucher_sale"] },
      },
    }),
    prisma.voucher.count({
      where: {
        campaign: { businessId: user.id },
        createdAt: { gte: today, lt: tomorrow },
        // 母券/原购：有实付或明确支付方式（排除纯拆分子券时尽量用 paid>0）
        paidCents: { gt: 0 },
      },
    }),
    storeIds.length
      ? prisma.voucherUsage.count({
          where: {
            storeId: { in: storeIds },
            createdAt: { gte: today, lt: tomorrow },
          },
        })
      : Promise.resolve(0),
    storeIds.length
      ? prisma.voucherUsage.findMany({
          where: { storeId: { in: storeIds } },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            store: { select: { name: true } },
            voucher: {
              select: {
                amountCents: true,
                productKind: true,
                campaign: { select: { name: true, productKind: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.voucher.findMany({
      where: {
        campaign: { businessId: user.id },
        paidCents: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        amountCents: true,
        paidCents: true,
        productKind: true,
        paymentMethod: true,
        shortCode: true,
        createdAt: true,
        campaign: { select: { name: true, productKind: true } },
      },
    }),
  ]);

  const balanceSgd = ((user.tokenAccount?.balance ?? 0) / 100).toFixed(2);

  return (
    <div className="pb-4">
      <div className="bg-card border-b border-border px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/business/settings"
            className="group flex items-center gap-3 min-w-0 flex-1"
          >
            <BrandAvatar
              src={user.businessLogo}
              name={user.businessName}
              size={44}
              rounded="2xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {lang === "en" ? "Company" : "企业后台"}
              </p>
              <p className="text-sm font-semibold text-foreground truncate group-active:opacity-70">
                {user.businessName || t("business.overview.myStore", lang)}
                <span className="ml-1.5 text-[10px] font-medium text-primary">
                  {lang === "en" ? "Settings" : "设置"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "en"
                  ? `${stores.length} store(s) · manage outlets separately`
                  : `${stores.length} 家门店 · 点「门店」进入具体店`}
              </p>
              {!user.businessLogo && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                  {lang === "en"
                    ? "Upload brand logo in Settings"
                    : "设置中可上传品牌 Logo"}
                </p>
              )}
            </div>
          </Link>
          <Link href="/business/tokens" className="shrink-0">
            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/35 px-2.5 py-1 rounded-full border border-amber-100 dark:border-amber-800/50">
              <Coins size={16} className="text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 nums">S${balanceSgd}</span>
            </div>
          </Link>
        </div>
      </div>

      {stores.length === 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-100 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/35 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {lang === "en" ? "Add stores next" : "下一步：添加门店"}
          </p>
          <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
            {lang === "en"
              ? "Company is ready. Create a store for QR codes and staff redemption."
              : "企业账号已就绪。添加门店后才能贴码、配店员与本店核销。"}
          </p>
          <Link
            href="/business/stores"
            className="inline-flex mt-3 h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-white"
          >
            {lang === "en" ? "Add store" : "添加门店"}
          </Link>
        </div>
      )}

      <div className="px-4 mt-4">
        <p className="text-[11px] text-muted-foreground mb-2">
          {lang === "en"
            ? "Company-wide numbers. Open a store for outlet-level work."
            : "以下为全公司汇总。进入具体门店做本店核销与店务。"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: Store,
              label: lang === "en" ? "Stores" : "门店数",
              value: stores.length.toString(),
            },
            {
              icon: Users,
              label: t("business.overview.members", lang),
              value: memberCount.toString(),
            },
            {
              icon: ShoppingCart,
              label: t("business.overview.salesToday", lang),
              value: salesToday.toString(),
            },
            {
              icon: Sparkles,
              label: t("business.overview.todayRedeems", lang),
              value: redeemsToday.toString(),
            },
          ].map((k) => {
            const IconComponent = k.icon;
            return (
              <Card key={k.label} className="bg-muted/50 border-0">
                <CardContent className="p-3">
                  <IconComponent size={20} className="text-muted-foreground" />
                  <p className="text-2xl font-bold text-foreground mt-2">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {stores.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-foreground mt-5 mb-2">
              {lang === "en" ? "Your stores" : "进入门店"}
            </h3>
            <div className="space-y-2">
              {stores.map((s) => (
                <Link key={s.id} href={`/business/stores/${s.id}`}>
                  <Card className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandAvatar
                          src={resolveStoreLogo(null, user.businessLogo)}
                          name={s.name}
                          size={40}
                          rounded="xl"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {s.name}
                          </p>
                          {s.address && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {s.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-primary shrink-0 font-medium">
                        {lang === "en" ? "Open →" : "进入 →"}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}

        <h3 className="text-sm font-semibold text-foreground mt-5 mb-2">
          {t("business.overview.quickActions", lang)}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: Store,
              label: lang === "en" ? "Stores" : "门店管理",
              desc:
                lang === "en"
                  ? "Outlets · staff · QR"
                  : "门店 · 店员 · 二维码",
              href: "/business/stores",
            },
            {
              icon: Calendar,
              label: lang === "en" ? "Campaigns" : "活动",
              desc:
                lang === "en"
                  ? `${activeCampaignCount} active`
                  : `${activeCampaignCount} 个进行中`,
              href: "/business/campaigns",
            },
            {
              icon: Wrench,
              label: t("business.tabs.hub", lang),
              desc: t("hub.quickDesc", lang),
              href: "/business/hub",
            },
            {
              icon: Coins,
              label: t("business.overview.topup", lang),
              desc: t("business.overview.topupDesc", lang),
              href: "/business/tokens",
            },
          ].map((a) => {
            const IconComponent = a.icon;
            return (
              <Link key={a.href} href={a.href}>
                <Card className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <IconComponent size={24} className="text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{a.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold text-foreground mt-5 mb-2">
          {t("business.overview.recentSales", lang)}
        </h3>
        {recentSales.length > 0 ? (
          recentSales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm mb-1"
            >
              <span className="text-muted-foreground truncate pr-2">
                {t("business.overview.saleRow", lang, {
                  campaign: s.campaign?.name || "—",
                  paid: (s.paidCents / 100).toFixed(2),
                  face: (s.amountCents / 100).toFixed(2),
                })}
                {s.productKind === "self_use" ||
                s.campaign?.productKind === "self_use" ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {lang === "en" ? "self" : "自用"}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {timeAgo(s.createdAt)}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm mb-2">
            {lang === "en" ? "No sales yet" : "暂无售出"}
          </div>
        )}

        <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">
          {t("business.overview.recent", lang)}
          <span className="ml-1 font-normal text-muted-foreground text-xs">
            · {lang === "en" ? "redemptions · all stores" : "核销 · 全部门店"}
          </span>
        </h3>
        {recentVoucherUsages.length > 0 ? (
          recentVoucherUsages.map((u) => {
            // 自用券 storeIncome=0，展示核销面值
            const redeemFace = (u.amountCents / 100).toFixed(2);
            return (
              <div
                key={u.id}
                className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm mb-1"
              >
                <span className="text-muted-foreground truncate pr-2">
                  {t("business.overview.redeemRow", lang, {
                    campaign: u.voucher.campaign?.name || "—",
                    store: u.store?.name || "—",
                    amount: redeemFace,
                  })}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {timeAgo(u.createdAt)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <div className="flex justify-center mb-2">
              <MailOpen size={32} className="text-muted-foreground" />
            </div>
            <p className="text-sm">{t("business.overview.noActivity", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

async function StaffStoreHome({
  sessionStoreId,
  lang,
}: {
  sessionStoreId?: string;
  lang: string;
}) {
  const store = await resolveStaffStore(sessionStoreId);
  if (!store) {
    return (
      <div className="px-4 py-16 text-center text-muted-foreground">
        <Store size={30} className="mx-auto mb-2" />
        <p className="text-sm">
          {lang === "en"
            ? "No store assigned. Contact your company admin."
            : "未绑定门店，请联系企业管理员。"}
        </p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [redeemsToday, paperToday, recent, recentPaper] = await Promise.all([
    prisma.voucherUsage.count({
      where: {
        storeId: store.id,
        createdAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.physicalTicket.count({
      where: {
        // 按实际核销门店统计（集团互核时 ≠ 印刷店）
        redeemedStoreId: store.id,
        status: "redeemed",
        redeemedAt: { gte: today, lt: tomorrow },
      },
    }),
    prisma.voucherUsage.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        voucher: { select: { campaign: { select: { name: true } } } },
      },
    }),
    prisma.physicalTicket.findMany({
      where: { redeemedStoreId: store.id, status: "redeemed" },
      orderBy: { redeemedAt: "desc" },
      take: 5,
      include: { batch: { select: { title: true, type: true, valueCents: true } } },
    }),
  ]);

  const staffBiz = await prisma.store.findUnique({
    where: { id: store.id },
    select: { business: { select: { businessLogo: true } } },
  });

  return (
    <div className="pb-4">
      <div className="bg-card border-b border-border px-4 py-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {lang === "en" ? "Your store" : "本店工作台"}
        </p>
        <div className="flex items-center gap-2.5 mt-1">
          <BrandAvatar
            src={resolveStoreLogo(null, staffBiz?.business.businessLogo)}
            name={store.name}
            size={40}
            rounded="xl"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {store.name}
            </p>
            {store.address && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {store.address}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <Card className="bg-muted/50 border-0">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-foreground">
              {redeemsToday + paperToday}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? "Redeems today" : "今日核销合计"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {lang === "en"
                ? `Online ${redeemsToday} · Paper ${paperToday}`
                : `线上 ${redeemsToday} · 实体 ${paperToday}`}
            </p>
          </CardContent>
        </Card>
        <Link href="/business/scan">
          <Card className="bg-primary border-0 h-full">
            <CardContent className="p-3 text-white">
              <ScanLine size={20} />
              <p className="text-sm font-semibold mt-2">
                {lang === "en" ? "Scan & redeem" : "扫码核销"}
              </p>
              <p className="text-[10px] text-white/70 mt-0.5">
                {lang === "en" ? "Voucher / paper tab" : "预付券 / 实体券 Tab"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/business/issue-self" className="col-span-2">
          <Card className="border-border hover:border-border transition-colors">
            <CardContent className="p-3 flex items-center gap-3">
              <Banknote size={24} className="text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? "Cash self-use voucher" : "现金发自用券"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "en"
                    ? "Collect cash → 6-digit code → redeem later"
                    : "收现金 → 发 6 位短码 → 消费时核销"}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        <Link href="/business/store">
          <Card className="hover:border-primary/30">
            <CardContent className="p-3">
              <QrCode size={20} className="text-foreground" />
              <p className="text-sm font-semibold mt-1 text-foreground">
                {lang === "en" ? "Store QR" : "本店二维码"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/business/members">
          <Card className="hover:border-primary/30">
            <CardContent className="p-3">
              <Users size={20} className="text-foreground" />
              <p className="text-sm font-semibold mt-1 text-foreground">
                {lang === "en" ? "Members" : "会员"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {lang === "en" ? "Recent online redeems" : "最近线上核销"}
        </h3>
        {recent.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            {lang === "en" ? "None yet" : "暂无"}
          </p>
        ) : (
          recent.map((u) => (
            <div
              key={u.id}
              className="flex justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm mb-1"
            >
              <span className="text-muted-foreground truncate">
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

      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {lang === "en" ? "Recent paper tickets" : "最近实体券核销"}
        </h3>
        {recentPaper.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            {lang === "en" ? "None yet" : "暂无"}
          </p>
        ) : (
          recentPaper.map((t) => (
            <div
              key={t.id}
              className="flex justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm mb-1"
            >
              <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                {t.batch.type === "draw" ? (
                  <Trophy size={13} className="shrink-0" />
                ) : (
                  <Ticket size={13} className="shrink-0" />
                )}
                <span className="truncate">
                  {t.batch.title}
                  {t.batch.valueCents
                    ? ` · S$${(t.batch.valueCents / 100).toFixed(0)}`
                    : ""}
                </span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {t.redeemedAt ? timeAgo(t.redeemedAt) : "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
