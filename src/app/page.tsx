import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { daysUntil } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";
import { LandingCountdown } from "@/components/landing/LandingCountdown";

export default async function LandingPage() {
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // Session check
  const token = c.get("gwm_token")?.value;
  let session: { userId: string; role: string } | null = null;
  if (token) session = await verifyToken(token);

  // Active lucky draws — sorted by popularity (entries + tickets)
  const draws = await prisma.campaign.findMany({
    where: { type: "lucky_draw", status: "active", endDate: { gt: new Date() } },
    include: { business: { select: { businessName: true } } },
    orderBy: [{ entryCount: "desc" }, { totalTicketCount: "desc" }],
    take: 6,
  });

  // Hot published coupons
  const coupons = await prisma.coupon.findMany({
    where: {
      status: "published",
      validUntil: { gt: new Date() },
      OR: [{ remainingQuantity: { gte: 1 } }, { remainingQuantity: null }],
    },
    include: { business: { select: { id: true, businessName: true } } },
    orderBy: { claimedCount: "desc" },
    take: 10,
  });

  // Featured stores
  const stores = await prisma.store.findMany({
    include: { business: { select: { businessName: true, businessCategory: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  // Pop score: entries + tickets * 0.5
  const drawScore = (d: typeof draws[0]) => d.entryCount + d.totalTicketCount * 0.5;
  const flagship = draws[0] || null;
  const otherDraws = draws.slice(1);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ── */}
      <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-4 pt-12 pb-8">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-extrabold text-white tracking-tight">WeMembers</h1>
            <div className="flex items-center gap-2">
              {session ? (
                <Link
                  href={session.role === "business" || session.role === "staff" ? "/business" : "/home"}
                  className="px-4 py-1.5 bg-white/20 text-white text-xs rounded-full hover:bg-white/30 transition-all"
                >
                  {session.role === "business" || session.role === "staff"
                    ? (lang === "zh" ? "管理后台" : "Dashboard")
                    : (lang === "zh" ? "进入首页" : "Home")}
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className="px-4 py-1.5 text-white/80 text-xs hover:text-white transition-all">
                    {t("landing.login", lang)}
                  </Link>
                  <Link href="/auth/register" className="px-4 py-1.5 bg-white text-[#1A6EFF] text-xs font-semibold rounded-full hover:bg-white/95 transition-all">
                    {t("landing.signUp", lang)}
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search bar */}
          <Link href={session ? "/home" : "/auth/login?redirect=/home"} className="block w-full">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/10 cursor-pointer hover:bg-white/15 transition-all">
              <svg className="w-5 h-5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm text-white/40">{t("landing.searchPlaceholder", lang)}</span>
            </div>
          </Link>
        </div>
      </header>

      {/* ═══════════════════════════════════════════
         🎰 LUCKY DRAWS — flagship hero + others
         ═══════════════════════════════════════════ */}
      {flagship && (
        <section className="relative -mt-6 px-4 pb-2">
          <div className="max-w-sm mx-auto">
            {/* ── Hero Card: #1 most popular draw ── */}
            <Link href={flagship.slug ? `/draw/${flagship.slug}` : `/draw/${flagship.id}`}>
              <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-amber-900/30 hover:shadow-amber-900/40 transition-all group cursor-pointer">

                {/* ── CAR IMAGE with gradient overlay ── */}
                <div className="relative h-52 bg-gradient-to-br from-slate-800 via-slate-900 to-black">
                  <img
                    src="https://imgd.aeplcdn.com/1056x594/n/cw/ec/195195/sealion-7-exterior-right-front-three-quarter-28.png"
                    alt="BYD Sealion 7"
                    className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                  />
                  {/* Dark gradient overlay for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent" />

                  {/* Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FF6B35] text-white text-[11px] font-extrabold shadow-lg">
                      🔥 {lang === "zh" ? "最受欢迎" : "#1 MOST POPULAR"}
                    </span>
                  </div>

                  {/* Prize name overlay on car */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-white/60 text-[10px] font-semibold uppercase tracking-[0.2em] mb-0.5">
                      {lang === "zh" ? "大奖" : "GRAND PRIZE"}
                    </p>
                    <p className="text-white text-2xl font-black tracking-tight drop-shadow-lg">
                      BYD Sealion 7
                    </p>
                    <p className="text-white/70 text-[11px] mt-0.5">
                      {lang === "zh" ? "新加坡最畅销电动SUV" : "Singapore's #1 Selling Electric SUV"}
                    </p>
                  </div>
                </div>

                {/* ── COUNTDOWN SECTION ── */}
                <div className="bg-gradient-to-b from-slate-900 to-slate-800 px-4 py-5">
                  <p className="text-center text-amber-400 text-[11px] font-bold uppercase tracking-[0.15em] mb-3">
                    ⏳ {flagship.drawDate ? (lang === "zh" ? "距离开奖倒计时" : "DRAW COUNTDOWN") : (lang === "zh" ? "距离结束" : "ENDS IN")}
                  </p>
                  <LandingCountdown endDate={flagship.endDate.toISOString()} drawDate={flagship.drawDate?.toISOString()} />
                </div>

                {/* ── POOL + STATS ── */}
                <div className="bg-slate-900 px-4 pb-5">
                  {/* Pool progress */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-amber-400 font-bold">
                        {lang === "zh" ? "🏆 奖池" : "🏆 POOL"} S${((flagship.instantPoolCents || 0) / 100).toLocaleString()}
                      </span>
                      <span className="text-white/30 font-semibold">
                        S$200,000
                      </span>
                    </div>
                    <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#FF6B35] via-amber-500 to-yellow-400 rounded-full transition-all duration-1000 relative"
                        style={{ width: `${Math.min(100, Math.round(((flagship.instantPoolCents || 0) / 20000000) * 100))}%` }}
                      >
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent rounded-full" />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] mt-1">
                      <span className="text-amber-400 font-bold">{Math.round(((flagship.instantPoolCents || 0) / 20000000) * 100)}%</span>
                      <span className="text-white/20">{lang === "zh" ? "还差" : "to go"} S${(200000 - Math.round((flagship.instantPoolCents || 0) / 100)).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center bg-white/5 rounded-xl py-2.5">
                      <p className="text-white text-lg font-extrabold">{flagship.entryCount}</p>
                      <p className="text-white/30 text-[10px]">{lang === "zh" ? "人已参与" : "Joined"}</p>
                    </div>
                    <div className="text-center bg-white/5 rounded-xl py-2.5">
                      <p className="text-white text-lg font-extrabold">{flagship.totalTicketCount}</p>
                      <p className="text-white/30 text-[10px]">{lang === "zh" ? "张抽奖券" : "Tickets"}</p>
                    </div>
                    <div className="text-center bg-white/5 rounded-xl py-2.5">
                      <p className="text-white text-lg font-extrabold">
                        {flagship.drawDate ? Math.max(1, Math.ceil((new Date(flagship.endDate).getTime() - Date.now()) / 86400000)) : 0}
                      </p>
                      <p className="text-white/30 text-[10px]">{lang === "zh" ? "天后开奖" : "Days Left"}</p>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="text-center">
                    <span className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-[#FF6B35] to-amber-500 text-white text-base font-extrabold rounded-full shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 transition-all active:scale-[0.97] uppercase tracking-wide">
                      {lang === "zh" ? "🎰 立即参与" : "🎰 ENTER NOW"}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            {/* ── Other draws — horizontal scroll ── */}
            {otherDraws.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">
                  {lang === "zh" ? "更多抽奖活动" : "More Lucky Draws"}
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {otherDraws.map((d) => {
                    const daysLeft = daysUntil(d.endDate);
                    const poolSgd = ((d.instantPoolCents || 0) / 100).toFixed(0);
                    return (
                      <Link
                        key={d.id}
                        href={d.slug ? `/draw/${d.slug}` : `/draw/${d.id}`}
                        className="snap-start shrink-0 w-[170px]"
                      >
                        <Card className={`overflow-hidden border-2 hover:shadow-md transition-all h-full ${
                          daysLeft <= 5 ? "border-red-200" : "border-slate-100"
                        }`}>
                          <div className={`h-1 ${daysLeft <= 5 ? "bg-red-400" : "bg-amber-300"}`} />
                          <CardContent className="p-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-lg">🎰</span>
                              <p className="text-xs font-semibold text-slate-800 truncate">{d.name}</p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>
                                {daysLeft <= 5
                                  ? (lang === "zh" ? `⏰ 剩${daysLeft}天` : `⏰ ${daysLeft}d left`)
                                  : (lang === "zh" ? `${daysLeft}天后开奖` : `${daysLeft}d`)}
                              </span>
                              <span>👥 {d.entryCount}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                              <span>{lang === "zh" ? "奖池" : "Pool"} S${poolSgd}</span>
                              <span>🎟️ {d.totalTicketCount}</span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
         🔥 HOT VOUCHERS
         ═══════════════════════════════════════════ */}
      <section className="px-4 pt-6 pb-2">
        <div className="max-w-sm mx-auto">
          <h2 className="text-base font-semibold text-slate-900 mb-3">{t("landing.hotVouchers", lang)}</h2>
          {coupons.length > 0 ? (
            <div className="space-y-2">
              {coupons.slice(0, 6).map((c) => {
                const displayValue =
                  c.type === "percentage"
                    ? `${(c.valueCents / 100).toFixed(0)}${lang === "zh" ? "折" : "% off"}`
                    : c.type === "free_item"
                    ? (lang === "zh" ? "免单" : "Free")
                    : `$${(c.valueCents / 100).toFixed(0)}`;
                const soldOut = c.remainingQuantity !== null && c.remainingQuantity <= 0;
                return (
                  <Link key={c.id} href={`/coupons/${c.id}`}>
                    <Card className={`hover:border-[#1A6EFF]/30 border-l-4 border-l-[#FF6B35] transition-colors ${soldOut ? "opacity-50" : ""}`}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-[#FF6B35] shrink-0">{displayValue}</p>
                            <Badge variant="slate" size="sm">{c.pointsRequired}⭐</Badge>
                            {c.giftType && c.giftType !== "none" && (
                              <span className="text-xs">{c.giftType === "points" ? "⭐" : c.giftType === "lottery" ? "🎰" : "🎁"}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1 truncate">{c.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {c.business?.businessName} · {c.claimedCount}{lang === "zh" ? "人已领" : " claimed"}
                            {" · "}{lang === "zh" ? "剩" : ""}{c.remainingQuantity ?? "∞"}{lang === "zh" ? "张" : " left"}
                          </p>
                        </div>
                        {!soldOut && (
                          <span className="ml-2 px-3 py-1 bg-[#1A6EFF] text-white text-[10px] rounded-full shrink-0 font-medium">
                            {lang === "zh" ? "领取" : "Claim"}
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-50 rounded-xl">
              <p className="text-3xl mb-2">🎫</p>
              <p className="text-sm text-slate-400">{lang === "zh" ? "暂无代金券，敬请期待" : "No vouchers yet, stay tuned"}</p>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
         🏪 FEATURED STORES
         ═══════════════════════════════════════════ */}
      {stores.length > 0 && (
        <section className="px-4 pt-6 pb-2">
          <div className="max-w-sm mx-auto">
            <h2 className="text-base font-semibold text-slate-900 mb-3">{t("landing.featuredStores", lang)}</h2>
            <div className="grid grid-cols-2 gap-2">
              {stores.slice(0, 4).map((s) => (
                <Link key={s.id} href={`/store/${s.slug}`}>
                  <Card className="hover:border-[#1A6EFF]/30 transition-colors h-full">
                    <CardContent className="p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-base shrink-0">🏪</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{s.business.businessName}</p>
                        </div>
                      </div>
                      {s.address && <p className="text-[10px] text-slate-400 truncate">📍 {s.address}</p>}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
         WHY JOIN
         ═══════════════════════════════════════════ */}
      <section className="px-4 pt-8 pb-4">
        <div className="max-w-sm mx-auto">
          <h2 className="text-base font-semibold text-slate-900 text-center mb-4">{t("landing.whyJoin", lang)}</h2>
          <div className="space-y-3">
            <Benefit icon="⭐" color="blue" title={t("landing.benefitPoints", lang)} desc={lang === "zh" ? "每次消费自动累积积分，积分可兑换代金券和礼品" : "Auto-earn points on every purchase, redeem for vouchers & gifts"} />
            <Benefit icon="👑" color="emerald" title={t("landing.benefitTiers", lang)} desc={lang === "zh" ? "普通→银卡→金卡→铂金，等级越高权益越多" : "Regular→Silver→Gold→Platinum, higher tiers unlock more perks"} />
            <Benefit icon="🎰" color="violet" title={t("landing.benefitDraws", lang)} desc={lang === "zh" ? "上传消费收据即可参与抽奖，即时开奖或等大奖" : "Upload receipts to enter draws — win instantly or wait for grand prizes"} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
         CTA (not logged in)
         ═══════════════════════════════════════════ */}
      {!session && (
        <section className="px-4 py-6">
          <div className="max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-[#1A6EFF] to-blue-700 rounded-2xl p-6 text-center text-white">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-lg font-bold mb-1">
                {lang === "zh" ? "免费注册，开始省钱" : "Sign Up Free & Start Saving"}
              </p>
              <p className="text-white/60 text-xs mb-4">
                {lang === "zh" ? "领取代金券，累积积分，参与抽奖" : "Claim vouchers, earn points, join lucky draws"}
              </p>
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center px-8 py-3 bg-white text-[#1A6EFF] rounded-full font-semibold text-sm shadow-lg hover:bg-white/95 transition-all active:scale-[0.98]"
              >
                {t("landing.signUpCTA", lang)}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
         FOOTER
         ═══════════════════════════════════════════ */}
      <footer className="px-4 pb-8 pt-4">
        <div className="max-w-sm mx-auto text-center">
          <Link
            href="/for-business"
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-slate-500 transition-colors mb-1"
          >
            <span>🏢</span>
            <span>{t("landing.footer.forBusiness", lang)}</span>
          </Link>
          <p className="text-xs text-slate-200">{t("landing.footer.poweredBy", lang)}</p>
        </div>
      </footer>
    </div>
  );
}

/* ── Benefit item ── */
function Benefit({ icon, color, title, desc }: { icon: string; color: "blue" | "emerald" | "violet"; title: string; desc: string }) {
  const colors = {
    blue: { border: "border-blue-100", bg: "bg-blue-100", from: "from-blue-50" },
    emerald: { border: "border-emerald-100", bg: "bg-emerald-100", from: "from-emerald-50" },
    violet: { border: "border-violet-100", bg: "bg-violet-100", from: "from-violet-50" },
  };
  const c = colors[color];
  return (
    <div className={`flex items-start gap-3 p-3 bg-gradient-to-r ${c.from} to-white rounded-xl border ${c.border}`}>
      <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center text-lg shrink-0`}>{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
