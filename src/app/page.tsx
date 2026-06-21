"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";

const content = {
  zh: {
    nav: { signUp: "免费注册", login: "登录", dashboard: "管理后台", home: "进入首页" },
    hero: {
      badge: "🎉 全新上线",
      title: "WeMembers",
      subtitle: "一站式商户营销平台",
      desc: "代金券发券核销 · 会员积分等级 · 幸运抽奖活动",
      cta: "免费开始使用",
      secondary: "了解更多 ↓",
    },
    stats: [
      { value: "3", unit: "大模块", label: "券·会员·抽奖" },
      { value: "5", unit: "分钟", label: "商家上线时间" },
      { value: "S$", valuePrefix: true, valueAlt: "0", unit: "月费", label: "免费使用" },
    ],
    pillars: [
      {
        icon: "🎫",
        title: "代金券系统",
        subtitle: "发券 · 领券 · 核销 · 结算",
        desc: "三种券类型灵活组合。客户扫码领券，门店扫码核销。跨店自动分账结算，发券方赚推广费，核销方低成本获客。",
        features: [
          { title: "三种券型", body: "定额减免、折扣券、免单券" },
          { title: "积分领取", body: "限量控制，每人限领，限时有效" },
          { title: "跨店结算", body: "三方自动分账，推广费+平台费" },
        ],
        gradient: "from-blue-500 to-blue-600",
        bg: "bg-blue-50",
        text: "text-blue-700",
      },
      {
        icon: "👥",
        title: "会员系统",
        subtitle: "积分 · 等级 · 权益 · 留存",
        desc: "四等级会员体系，商家自定义门槛与权益。消费自动积分，签到奖励叠加。积分流水全程可追溯，数据完全隔离。",
        features: [
          { title: "四级等级", body: "普通/银卡/金卡/铂金，自定义门槛" },
          { title: "自动积分", body: "核销自动积分，签到叠加奖励" },
          { title: "数据追踪", body: "积分流水、等级进度可视化" },
        ],
        gradient: "from-emerald-500 to-emerald-600",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
      },
      {
        icon: "🎰",
        title: "幸运抽奖",
        subtitle: "代金券抽奖 · 奖池透明 · 开奖倒计时",
        desc: "代金券参与即时抽奖，消费即有机会赢取大奖。奖池实时可见，延迟开奖等大奖。即时抽+延迟抽双模式，商家联合活动。",
        features: [
          { title: "券即机会", body: "领券/购券自动获得抽奖资格" },
          { title: "奖池透明", body: "双轨奖池实时可见，进度追踪" },
          { title: "商家联合", body: "多商家参与，共用奖池做大活动" },
        ],
        gradient: "from-violet-500 to-violet-600",
        bg: "bg-violet-50",
        text: "text-violet-700",
      },
    ],
    flow: {
      title: "三步开始",
      steps: [
        { num: "1", icon: "🏢", title: "注册企业", desc: "30秒完成注册，自动创建门店与 Stripe 收款账户" },
        { num: "2", icon: "🎫", title: "创建代金券", desc: "选类型、设面值、定积分，一键发布到店铺页" },
        { num: "3", icon: "📱", title: "贴码营业", desc: "打印店铺二维码贴在收银台。客户扫码领券，核销自动积分" },
      ],
    },
    cta: {
      title: "准备好了吗？",
      desc: "注册即赠 Token，零成本开始。",
      button: "🎉 免费注册，立即开始",
    },
    footer: "Powered by WeMembers · 简单好用的商户营销工具",
  },
  en: {
    nav: { signUp: "Sign Up", login: "Login", dashboard: "Dashboard", home: "Home" },
    hero: {
      badge: "🎉 Just Launched",
      title: "WeMembers",
      subtitle: "All-in-One Merchant Platform",
      desc: "Vouchers · Membership · Lucky Draw — launch in minutes",
      cta: "Get Started Free",
      secondary: "Learn More ↓",
    },
    stats: [
      { value: "3", unit: "Modules", label: "Vouchers·Members·Draw" },
      { value: "5", unit: "min", label: "Setup Time" },
      { value: "S$", valuePrefix: true, valueAlt: "0", unit: "/mo", label: "Free to Use" },
    ],
    pillars: [
      {
        icon: "🎫",
        title: "Vouchers",
        subtitle: "Issue · Claim · Redeem · Settle",
        desc: "Three voucher types with flexible rules. Customers scan & claim. Cross-store auto settlement with three-way split. Issuers earn promo fees.",
        features: [
          { title: "3 Types", body: "Fixed, discount & free-item vouchers" },
          { title: "Point Claim", body: "Quantity control, per-customer limit" },
          { title: "Settlement", body: "Auto 3-way split: issuer, redeemer, platform" },
        ],
        gradient: "from-blue-500 to-blue-600",
        bg: "bg-blue-50",
        text: "text-blue-700",
      },
      {
        icon: "👥",
        title: "Membership",
        subtitle: "Points · Tiers · Benefits · Retention",
        desc: "Four-tier system with custom thresholds. Auto points on purchase, check-in streaks. Full audit trail with per-business data isolation.",
        features: [
          { title: "4 Tiers", body: "Regular/Silver/Gold/Platinum, custom thresholds" },
          { title: "Auto Points", body: "Redeem-based earning + check-in bonus" },
          { title: "Analytics", body: "Points log, tier progress visualization" },
        ],
        gradient: "from-emerald-500 to-emerald-600",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
      },
      {
        icon: "🎰",
        title: "Lucky Draw",
        subtitle: "Voucher Draw · Pool · Countdown · Prizes",
        desc: "Use vouchers to enter instant draws with a transparent pool. Deferred mode for grand prizes. Dual mode + multi-business joint campaigns.",
        features: [
          { title: "Voucher Entry", body: "Claim/buy vouchers to auto-enter draws" },
          { title: "Live Pool", body: "Dual-track pool, real-time progress" },
          { title: "Multi-Biz", body: "Joint campaigns across multiple businesses" },
        ],
        gradient: "from-violet-500 to-violet-600",
        bg: "bg-violet-50",
        text: "text-violet-700",
      },
    ],
    flow: {
      title: "How It Works",
      steps: [
        { num: "1", icon: "🏢", title: "Register", desc: "Sign up in 30s. Auto-creates store + Stripe account" },
        { num: "2", icon: "🎫", title: "Create Voucher", desc: "Pick type, set value, define points. One-click publish" },
        { num: "3", icon: "📱", title: "Go Live", desc: "Print QR for counter. Customers scan, claim & auto-redeem" },
      ],
    },
    cta: {
      title: "Ready to Start?",
      desc: "Free token bonus on signup. Zero cost to begin.",
      button: "🎉 Sign Up Free & Start Now",
    },
    footer: "Powered by WeMembers · Simple merchant marketing tools",
  },
};

export default function HomePage() {
  const { lang } = useLang();
  const t = content[lang as keyof typeof content] || content.zh;
  const [session, setSession] = useState<any>(null);
  const [roleView, setRoleView] = useState<"business" | "consumer">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("wem_role_view") as "business" | "consumer") || "consumer";
    }
    return "consumer";
  });
  const isZh = lang === "zh";

  function switchRoleView(v: "business" | "consumer") {
    setRoleView(v);
    try { localStorage.setItem("wem_role_view", v); } catch {}
  }

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.data?.id) setSession(d.data);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-5 pt-16 pb-24 text-white">
        {/* Decorative blobs */}
        <div className="absolute top-[-100px] right-[-80px] w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 bg-violet-500/15 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-sm mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-white/80 backdrop-blur mb-6">
            {t.hero.badge}
          </span>

          {/* ── Role Tabs ── */}
          <div className="flex gap-1.5 justify-center mb-6">
            <button
              data-role-switch="business"
              onClick={() => switchRoleView("business")}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                roleView === "business"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              🏪 {isZh ? "我是商家" : "For Business"}
            </button>
            <button
              onClick={() => switchRoleView("consumer")}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                roleView === "consumer"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              👤 {isZh ? "我是消费者" : "For Consumers"}
            </button>
          </div>

          {roleView === "business" ? (
            <>
              <h1 className="text-4xl font-extrabold tracking-tight mb-3">
                <span className="bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">
                  {t.hero.title}
                </span>
              </h1>
              <p className="text-xl font-semibold text-white/90 mb-2">{t.hero.subtitle}</p>
              <p className="text-sm text-white/50 mb-8">{t.hero.desc}</p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-extrabold tracking-tight mb-3">
                <span className="bg-gradient-to-r from-amber-400 to-orange-300 bg-clip-text text-transparent">
                  {isZh ? "发现身边好券" : "Discover Nearby Deals"}
                </span>
              </h1>
              <p className="text-xl font-semibold text-white/90 mb-2">
                {isZh ? "领券省钱 · 积分升级" : "Claim Vouchers · Earn Points"}
              </p>
              <p className="text-sm text-white/50 mb-8">
                {isZh
                  ? "扫码领取代金券，消费省钱。参与抽奖赢大奖！"
                  : "Scan to claim vouchers, save on every purchase. Join lucky draws!"}
              </p>
            </>
          )}

          {session ? (
            <Link
              href={session.role === "business" ? "/business" : "/home"}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-slate-900 rounded-full font-semibold text-sm shadow-xl shadow-black/20 hover:bg-white/95 transition-all active:scale-[0.98]"
            >
              {session.role === "business" ? t.nav.dashboard : t.nav.home}
              <span className="text-lg">→</span>
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-slate-900 rounded-full font-semibold text-sm shadow-xl shadow-black/20 hover:bg-white/95 transition-all active:scale-[0.98]"
              >
                {t.hero.cta}
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center px-8 py-3.5 text-white/70 rounded-full font-medium text-sm border border-white/15 hover:bg-white/10 hover:text-white transition-all"
              >
                {t.nav.login}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── Consumer View ── */}
      {roleView === "consumer" ? (
        <ConsumerView isZh={isZh} lang={lang} />
      ) : (
        <>
      {/* ── Stats ── */}
      <section className="relative -mt-8 px-5">
        <div className="max-w-sm mx-auto">
          <div className="grid grid-cols-3 gap-3">
            {t.stats.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 py-4 px-2 text-center shadow-sm">
                <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {s.valuePrefix && <span className="text-base">{s.value}</span>}
                  {s.valueAlt || s.value}
                  <span className="text-sm font-normal text-slate-400 ml-0.5">{s.unit}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pillars ── */}
      <section className="px-5 pt-16 pb-8 max-w-sm mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {lang === "zh" ? "三大核心功能" : "Three Core Products"}
          </h2>
          <p className="text-sm text-slate-400">
            {lang === "zh" ? "覆盖商户营销全流程" : "End-to-end merchant marketing"}
          </p>
        </div>

        <div className="space-y-6">
          {t.pillars.map((p, i) => (
            <div key={i} className="group relative bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Color accent bar at top */}
              <div className={`h-1.5 bg-gradient-to-r ${p.gradient}`} />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${p.bg} flex items-center justify-center text-2xl shrink-0`}>
                    {p.icon}
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${p.text}`}>{p.title}</h3>
                    <p className="text-xs text-slate-400">{p.subtitle}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed mb-4">{p.desc}</p>

                {/* Feature pills */}
                <div className="space-y-2">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2.5">
                      <div className={`w-5 h-5 rounded-md ${p.bg} ${p.text} flex items-center justify-center shrink-0 mt-0.5`}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{f.title}</p>
                        <p className="text-[11px] text-slate-400">{f.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="px-5 py-16 bg-slate-50">
        <div className="max-w-sm mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">{t.flow.title}</h2>
          <p className="text-sm text-slate-400 text-center mb-8">
            {lang === "zh" ? "从注册到营业，只需三步" : "From signup to live in three steps"}
          </p>

          <div className="space-y-6">
            {t.flow.steps.map((s, i) => (
              <div key={i} className="flex gap-4">
                {/* Number & line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-10 h-10 rounded-full bg-white border-2 border-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shadow-sm">
                    {s.num}
                  </div>
                  {i < t.flow.steps.length - 1 && (
                    <div className="w-0.5 flex-1 bg-blue-100 my-1" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{s.icon}</span>
                    <h3 className="font-semibold text-slate-900">{s.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-5 py-16">
        <div className="max-w-sm mx-auto text-center">
          <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-3xl p-8 text-white shadow-xl">
            <p className="text-3xl mb-3">🚀</p>
            <h2 className="text-xl font-bold mb-2">{t.cta.title}</h2>
            <p className="text-white/60 text-sm mb-6">{t.cta.desc}</p>
            {!session && (
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-slate-900 rounded-full font-semibold text-sm shadow-lg hover:bg-white/95 transition-all active:scale-[0.98]"
              >
                {t.cta.button}
              </Link>
            )}
          </div>
        </div>
      </section>

        </>
      )}

      {/* ── Footer ── */}
      <footer className="px-5 pb-10 text-center">
        <p className="text-xs text-slate-300">{t.footer}</p>
      </footer>
    </div>
  );
}

// ──── Consumer View Component ────

const PRIZE_TIERS = [
  { icon: "🎰", labelZh: "即时奖", labelEn: "Instant Win", rangeZh: "S$0.50~S$20", rangeEn: "S$0.50~S$20", descZh: "买券100%中奖", descEn: "100% win on purchase", color: "from-amber-400 to-orange-400", bg: "bg-amber-50", emoji: "⚡" },
  { icon: "📱", labelZh: "iPhone", labelEn: "iPhone", rangeZh: "目标 S$5,000", rangeEn: "Target S$5,000", descZh: "大奖池抽取", descEn: "Grand pool draw", color: "from-blue-400 to-cyan-400", bg: "bg-blue-50", emoji: "📱" },
  { icon: "🚗", labelZh: "BYD 汽车", labelEn: "BYD Car", rangeZh: "目标 S$667,000", rangeEn: "Target S$667,000", descZh: "终极豪华大奖", descEn: "Ultimate grand prize", color: "from-violet-400 to-purple-400", bg: "bg-violet-50", emoji: "🚗" },
];

function ConsumerView({ isZh, lang }: { isZh: boolean; lang: string }) {
  const [draws, setDraws] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [drawRes, couponRes] = await Promise.all([
        fetch("/api/campaign/active-draws").then(r => r.json()).catch(() => ({ data: [] })),
        fetch("/api/coupons/discover").then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      setDraws(drawRes.data || []);
      setCoupons((couponRes.data || []).slice(0, 6));
      setLoaded(true);
    }
    load();
  }, []);

  const mainDraw = draws[0] || null;

  return (
    <>
      {/* ── Prize Showcase ── */}
      <section className="relative -mt-8 px-5 pb-4">
        <div className="max-w-sm mx-auto">
          <div className="grid grid-cols-3 gap-2">
            {PRIZE_TIERS.map((prize, i) => {
              const cd = mainDraw?.countdown?.find((c: any) => c.prizeName === prize.labelEn) || null;
              const pct = cd?.progress || 0;
              const days = cd?.daysPredicted;
              const dayLabel = days === undefined ? "—" : days <= 0
                ? (isZh ? "即将开奖" : "Soon")
                : (isZh ? `${days}天` : `${days}d`);
              return (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 py-3 px-2 text-center shadow-sm">
                  <p className="text-2xl mb-1">{prize.icon}</p>
                  <p className="text-[11px] font-semibold text-slate-900">
                    {isZh ? prize.labelZh : prize.labelEn}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isZh ? prize.rangeZh : prize.rangeEn}
                  </p>
                  {cd && (
                    <>
                      <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${prize.color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-0.5">{pct}% · {dayLabel}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {mainDraw && (
            <p className="text-center text-[10px] text-slate-400 mt-2">
              {isZh
                ? `奖池累计 S$${mainDraw.totalPoolSgd} · 日均 S$${mainDraw.dailyVelocitySgd}`
                : `Pool S$${mainDraw.totalPoolSgd} · S$${mainDraw.dailyVelocitySgd}/day`}
            </p>
          )}
        </div>
      </section>

      {/* ── Hot Coupons ── */}
      {loaded && coupons.length > 0 && (
        <section className="px-5 pt-4 pb-8 max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900">
              🔥 {isZh ? "热门代金券" : "Hot Vouchers"}
            </h2>
            <a href="/home" className="text-xs text-blue-500">
              {isZh ? "更多 →" : "More →"}
            </a>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {coupons.map((c: any) => {
              const displayValue = c.type === "percentage"
                ? `${(c.valueCents / 100).toFixed(0)}${isZh ? "折" : "% OFF"}`
                : c.type === "free_item"
                ? (isZh ? "免单" : "FREE")
                : `S$${(c.valueCents / 100).toFixed(0)}`;
              return (
                <a key={c.id} href={`/coupons/${c.id}`} className="snap-start shrink-0 w-36 bg-white rounded-xl border border-slate-100 p-3 hover:border-blue-200 transition-colors no-underline">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center text-lg mb-2">🎫</div>
                  <p className="text-sm font-bold text-[#FF6B35]">{displayValue}</p>
                  <p className="text-[11px] text-slate-900 mt-0.5 line-clamp-1">{c.title}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{c.pointsRequired}⭐</p>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ── For Business Entry ── */}
      <section className="px-5 pb-12 max-w-sm mx-auto">
        <button
          onClick={() => {
            const el = document.querySelector('[data-role-switch="business"]');
            if (el instanceof HTMLElement) el.click();
          }}
          className="w-full py-3 bg-slate-50 rounded-xl text-xs text-slate-400 hover:bg-slate-100 transition-colors"
        >
          🏪 {isZh ? "我是商家，查看营销工具" : "I'm a business, view marketing tools"}
        </button>
      </section>
    </>
  );
}
