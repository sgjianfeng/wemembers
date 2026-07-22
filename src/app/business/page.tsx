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
          take: 5,
          include: {
            store: { select: { name: true } },
            voucher: { select: { campaign: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  const balanceSgd = ((user.tokenAccount?.balance ?? 0) / 100).toFixed(2);

  return (
    <div className="pb-4">
      <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-20">
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
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                {lang === "en" ? "Company" : "企业后台"}
              </p>
              <p className="text-sm font-semibold text-slate-900 truncate group-active:opacity-70">
                {user.businessName || t("business.overview.myStore", lang)}
                <span className="ml-1.5 text-[10px] font-medium text-[#1A6EFF]">
                  {lang === "en" ? "Settings" : "设置"}
                </span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {lang === "en"
                  ? `${stores.length} store(s) · manage outlets separately`
                  : `${stores.length} 家门店 · 点「门店」进入具体店`}
              </p>
              {!user.businessLogo && (
                <p className="text-[10px] text-amber-600 mt-0.5">
                  {lang === "en"
                    ? "Upload brand logo in Settings"
                    : "设置中可上传品牌 Logo"}
                </p>
              )}
            </div>
          </Link>
          <Link href="/business/tokens" className="shrink-0">
            <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
              <span className="text-xs">💰</span>
              <span className="text-sm font-semibold text-amber-700">S${balanceSgd}</span>
            </div>
          </Link>
        </div>
      </div>

      {stores.length === 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
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
            className="inline-flex mt-3 h-9 items-center rounded-full bg-[#1A6EFF] px-4 text-xs font-semibold text-white"
          >
            {lang === "en" ? "Add store" : "添加门店"}
          </Link>
        </div>
      )}

      <div className="px-4 mt-4">
        <p className="text-[11px] text-slate-400 mb-2">
          {lang === "en"
            ? "Company-wide numbers. Open a store for outlet-level work."
            : "以下为全公司汇总。进入具体门店做本店核销与店务。"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: "🏪",
              label: lang === "en" ? "Stores" : "门店数",
              value: stores.length.toString(),
            },
            {
              icon: "👤",
              label: t("business.overview.members", lang),
              value: memberCount.toString(),
            },
            {
              icon: "🛒",
              label: t("business.overview.salesToday", lang),
              value: salesToday.toString(),
            },
            {
              icon: "💎",
              label: t("business.overview.todayRedeems", lang),
              value: redeemsToday.toString(),
            },
          ].map((k) => (
            <Card key={k.label} className="bg-slate-50 border-0">
              <CardContent className="p-3">
                <span className="text-lg">{k.icon}</span>
                <p className="text-2xl font-bold text-slate-900 mt-2">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {stores.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">
              {lang === "en" ? "Your stores" : "进入门店"}
            </h3>
            <div className="space-y-2">
              {stores.map((s) => (
                <Link key={s.id} href={`/business/stores/${s.id}`}>
                  <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandAvatar
                          src={resolveStoreLogo(null, user.businessLogo)}
                          name={s.name}
                          size={40}
                          rounded="xl"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {s.name}
                          </p>
                          {s.address && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {s.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-[#1A6EFF] shrink-0 font-medium">
                        {lang === "en" ? "Open →" : "进入 →"}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}

        <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">
          {t("business.overview.quickActions", lang)}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              icon: "🏪",
              label: lang === "en" ? "Stores" : "门店管理",
              desc:
                lang === "en"
                  ? "Add outlets & staff"
                  : "添加门店 · 店员",
              href: "/business/stores",
            },
            {
              icon: "🎫",
              label: t("business.overview.issueCoupon", lang),
              desc: t("business.overview.issueCouponDesc", lang),
              href: "/business/coupons/new",
            },
            {
              icon: "🎰",
              label: lang === "en" ? "Campaigns" : "活动 / 抽奖",
              desc:
                lang === "en"
                  ? `${activeCampaignCount} active`
                  : `${activeCampaignCount} 个进行中`,
              href: "/business/campaigns",
            },
            {
              icon: "💰",
              label: t("business.overview.topup", lang),
              desc: t("business.overview.topupDesc", lang),
              href: "/business/tokens",
            },
            {
              icon: "📷",
              label: t("business.overview.scan", lang),
              desc:
                lang === "en"
                  ? "Pick a store to redeem"
                  : "核销时选择门店",
              href: "/business/scan",
            },
            {
              icon: "🖨️",
              label: lang === "en" ? "Physical tickets" : "实体券印刷",
              desc:
                lang === "en"
                  ? "Print store-only codes"
                  : "本店代金/抽奖 · 扫码绑定",
              href: "/business/physical",
            },
            {
              icon: "⚙️",
              label: t("business.overview.settings", lang),
              desc: t("business.overview.settingsDesc", lang),
              href: "/business/settings",
            },
          ].map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-2xl">{a.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{a.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{a.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-slate-900 mt-5 mb-2">
          {t("business.overview.recent", lang)}
          <span className="ml-1 font-normal text-slate-400 text-xs">
            · {lang === "en" ? "all stores" : "全部门店"}
          </span>
        </h3>
        {recentVoucherUsages.length > 0 ? (
          recentVoucherUsages.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm mb-1"
            >
              <span className="text-slate-600 truncate pr-2">
                {t("business.overview.usageRow", lang, {
                  campaign: u.voucher.campaign?.name || "—",
                  store: u.store?.name || "—",
                  amount: (u.storeIncome / 100).toFixed(2),
                })}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {timeAgo(u.createdAt)}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p className="text-3xl mb-2">📭</p>
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
      <div className="px-4 py-16 text-center text-slate-400">
        <p className="text-3xl mb-2">🏪</p>
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
        storeId: store.id,
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
      where: { storeId: store.id, status: "redeemed" },
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
      <div className="bg-white border-b border-slate-100 px-4 py-3">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
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
            <p className="text-sm font-semibold text-slate-900 truncate">
              {store.name}
            </p>
            {store.address && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {store.address}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <Card className="bg-slate-50 border-0">
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-slate-900">
              {redeemsToday + paperToday}
            </p>
            <p className="text-xs text-slate-400">
              {lang === "en" ? "Redeems today" : "今日核销合计"}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {lang === "en"
                ? `Online ${redeemsToday} · Paper ${paperToday}`
                : `线上 ${redeemsToday} · 实体 ${paperToday}`}
            </p>
          </CardContent>
        </Card>
        <Link href="/business/scan">
          <Card className="bg-[#1A6EFF] border-0 h-full">
            <CardContent className="p-3 text-white">
              <span className="text-lg">📷</span>
              <p className="text-sm font-semibold mt-2">
                {lang === "en" ? "Scan & redeem" : "扫码核销"}
              </p>
              <p className="text-[10px] text-white/70 mt-0.5">
                {lang === "en" ? "Voucher / paper tab" : "预付券 / 实体券 Tab"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2">
        <Link href="/business/store">
          <Card className="hover:border-[#1A6EFF]/30">
            <CardContent className="p-3">
              <p className="text-lg">📱</p>
              <p className="text-sm font-semibold mt-1 text-slate-900">
                {lang === "en" ? "Store QR" : "本店二维码"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/business/members">
          <Card className="hover:border-[#1A6EFF]/30">
            <CardContent className="p-3">
              <p className="text-lg">👥</p>
              <p className="text-sm font-semibold mt-1 text-slate-900">
                {lang === "en" ? "Members" : "会员"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          {lang === "en" ? "Recent online redeems" : "最近线上核销"}
        </h3>
        {recent.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">
            {lang === "en" ? "None yet" : "暂无"}
          </p>
        ) : (
          recent.map((u) => (
            <div
              key={u.id}
              className="flex justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm mb-1"
            >
              <span className="text-slate-600 truncate">
                {u.voucher.campaign?.name || "—"} · +S$
                {(u.storeIncome / 100).toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {timeAgo(u.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="px-4 mt-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          {lang === "en" ? "Recent paper tickets" : "最近实体券核销"}
        </h3>
        {recentPaper.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">
            {lang === "en" ? "None yet" : "暂无"}
          </p>
        ) : (
          recentPaper.map((t) => (
            <div
              key={t.id}
              className="flex justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm mb-1"
            >
              <span className="text-slate-600 truncate">
                {t.batch.type === "draw" ? "🎰 " : "🎫 "}
                {t.batch.title}
                {t.batch.valueCents
                  ? ` · S$${(t.batch.valueCents / 100).toFixed(0)}`
                  : ""}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {t.redeemedAt ? timeAgo(t.redeemedAt) : "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
