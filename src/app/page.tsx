"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { TopHeader } from "@/components/ui/TopHeader";
import { PremiumCouponCard } from "@/components/landing/PremiumCouponCard";

const content = {
  zh: {
    nav: { signUp: "免费注册", login: "登录", dashboard: "管理后台", home: "进入首页" },
    hero: {
      badge: "🎉 全新上线",
      title: "WeMembers",
      subtitle: "代金券 · 抽奖券平台",
      desc: "发券核销 · 买券抽奖 · 零月费起步",
      cta: "零成本开始",
      secondary: "了解更多 ↓",
    },
    stats: [
      { value: "2", unit: "大能力", label: "代金券 · 抽奖" },
      { value: "5", unit: "分钟", label: "企业上线" },
      { value: "$0", unit: "", label: "零成本开始" },
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
        subtitle: "买券即抽 · 消费留余额 · 大奖倒计时",
        desc: "买 S$100 代金券 → 消费 S$70 → 剩 S$30 余额。每笔购买即时抽一次奖，100% 中现金。到店核销进大奖池，看倒计时开奖，赢 iPad、iPhone、BYD 海豹！",
        features: [
          { title: "买券即时抽", body: "每笔购券即时抽奖，100% 中现金奖励" },
          { title: "消费留余额", body: "消费多少扣多少，余额留用下次，灵活省钱" },
          { title: "倒计时大奖", body: "核销冲奖池，进度与倒计时可见，开奖赢大礼" },
        ],
        gradient: "from-violet-500 to-violet-600",
        bg: "bg-violet-50",
        text: "text-violet-700",
      },
    ],
    flow: {
      title: "三步开始",
      steps: [
        { num: "1", icon: "🏢", title: "注册企业", desc: "公司名 + UEN，邮箱验证，零月费开通账号" },
        { num: "2", icon: "🎫", title: "创建代金券 / 抽奖", desc: "发定额代金券，或上线买券即抽的幸运抽奖活动" },
        { num: "3", icon: "🏪", title: "加门店 · 贴码", desc: "添加门店、打印二维码，顾客扫码买券，到店核销" },
      ],
    },
    cta: {
      title: "准备好了吗？",
      desc: "零成本开始。无月费，先发券、再开抽奖。",
      button: "🎉 免费注册，立即开始",
    },
    footer: "Powered by WeMembers · 代金券与抽奖券平台",
  },
  en: {
    nav: { signUp: "Sign Up", login: "Login", dashboard: "Dashboard", home: "Home" },
    hero: {
      badge: "🎉 Just Launched",
      title: "WeMembers",
      subtitle: "Vouchers · Lucky Draw",
      desc: "Issue vouchers · run prize draws · start at $0",
      cta: "Start at $0",
      secondary: "Learn More ↓",
    },
    stats: [
      { value: "2", unit: "pillars", label: "Vouchers · Draw" },
      { value: "5", unit: "min", label: "Company setup" },
      { value: "$0", unit: "", label: "Start free" },
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
        subtitle: "Buy & Draw · Spend & Save · Grand Prize",
        desc: "Buy S$100 voucher → Spend S$70 → Keep S$30 balance. Every purchase triggers an instant draw (100% win rate). Redeems fund the grand pool — watch the countdown and win iPad, iPhone, BYD Seal & more!",
        features: [
          { title: "Instant Draw", body: "Every purchase triggers a draw, 100% cash win rate" },
          { title: "Spend & Save", body: "Pay only what you spend, balance rolls over — flexible savings" },
          { title: "Countdown Prize", body: "Redeems fund the pool — progress & countdown, then big wins" },
        ],
        gradient: "from-violet-500 to-violet-600",
        bg: "bg-violet-50",
        text: "text-violet-700",
      },
    ],
    flow: {
      title: "How It Works",
      steps: [
        { num: "1", icon: "🏢", title: "Register company", desc: "Company name + UEN, email verify — $0 / month" },
        { num: "2", icon: "🎫", title: "Vouchers & draws", desc: "Issue prepaid vouchers or buy-and-draw lucky campaigns" },
        { num: "3", icon: "🏪", title: "Add stores · QR", desc: "Open outlets, print QR — customers buy, you redeem in-store" },
      ],
    },
    cta: {
      title: "Ready?",
      desc: "Start at zero cost. No monthly fee — issue vouchers, then run draws.",
      button: "🎉 Sign up free & start",
    },
    footer: "Powered by WeMembers · Vouchers & lucky-draw platform",
  },
};

export default function HomePage() {
  const { lang } = useLang();
  const t = content[lang as keyof typeof content] || content.zh;
  const [session, setSession] = useState<any>(null);
  // 首屏固定 consumer，避免 SSR 与 localStorage 不一致导致 hydration 失败
  const [roleView, setRoleView] = useState<"business" | "consumer">("consumer");
  const isZh = lang === "zh";

  function switchRoleView(v: "business" | "consumer") {
    setRoleView(v);
    try {
      localStorage.setItem("wem_role_view", v);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wem_role_view");
      if (saved === "business" || saved === "consumer") {
        setRoleView(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.id) setSession(d.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top Header ── */}
      <TopHeader variant="landing">
        {/*
          顶栏跟随「我是消费者 / 商家」Tab + 真实会话：
          - 消费者 Tab 只展示消费者身份；商家会话不在此冒充用户名
          - 商家 Tab 同理
          单账号单角色：要换身份需登录另一角色账号
        */}
        {(() => {
          const isBizSession =
            session?.role === "business" || session?.role === "staff";
          const isCustSession = session?.role === "customer";
          const loginClass =
            "text-xs font-medium text-white/85 hover:text-white transition-colors px-2 py-1 rounded-full border border-white/20";

          if (roleView === "consumer") {
            if (isCustSession) {
              return (
                <Link
                  href="/home"
                  className="flex items-center gap-1.5 max-w-[9.5rem] text-left hover:opacity-90 transition-opacity"
                  title={session.displayName || session.phone || ""}
                >
                  <span className="shrink-0 text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-100 border border-amber-400/30">
                    {isZh ? "用户" : "You"}
                  </span>
                  <span className="text-xs font-medium text-white truncate">
                    {session.displayName ||
                      session.phone ||
                      session.email ||
                      (isZh ? "我的" : "Me")}
                  </span>
                </Link>
              );
            }
            // 未登录，或当前是商家会话：消费者视图只给「用户登录」
            return (
              <Link href="/auth/login?tab=customer" className={loginClass}>
                {isBizSession
                  ? isZh
                    ? "用户登录"
                    : "Customer login"
                  : t.nav.login}
              </Link>
            );
          }

          // roleView === business
          if (isBizSession) {
            return (
              <Link
                href="/business"
                className="flex items-center gap-1.5 max-w-[9.5rem] text-left hover:opacity-90 transition-opacity"
                title={session.businessName || session.displayName || ""}
              >
                <span className="shrink-0 text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-200 border border-sky-400/30">
                  {session.role === "staff"
                    ? isZh
                      ? "店员"
                      : "Staff"
                    : isZh
                      ? "商家"
                      : "Biz"}
                </span>
                <span className="text-xs font-medium text-white truncate">
                  {session.businessName ||
                    session.displayName ||
                    session.email ||
                    (isZh ? "商家账号" : "Business")}
                </span>
              </Link>
            );
          }
          return (
            <Link href="/auth/login?tab=business" className={loginClass}>
              {isCustSession
                ? isZh
                  ? "商家登录"
                  : "Business login"
                : t.nav.login}
            </Link>
          );
        })()}
      </TopHeader>

      {/* ── Hero（紧凑） ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-4 pt-4 pb-14 text-white">
        <div className="absolute top-[-80px] right-[-60px] w-56 h-56 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-40px] left-[-40px] w-48 h-48 bg-violet-500/15 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-sm mx-auto text-center">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-white/75 backdrop-blur mb-3">
            {t.hero.badge}
          </span>

          {/* ── Role Tabs ── */}
          <div className="flex gap-1 justify-center mb-3">
            <button
              onClick={() => switchRoleView("consumer")}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                roleView === "consumer"
                  ? "bg-white text-slate-900 shadow-md"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              👤 {isZh ? "我是消费者" : "For Consumers"}
            </button>
            <button
              data-role-switch="business"
              onClick={() => switchRoleView("business")}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                roleView === "business"
                  ? "bg-white text-slate-900 shadow-md"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              🏪 {isZh ? "我是商家" : "For Business"}
            </button>
          </div>

          {roleView === "business" ? (
            <>
              <h1 className="text-3xl font-extrabold tracking-tight mb-1.5">
                <span className="bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">
                  {t.hero.title}
                </span>
              </h1>
              <p className="text-base font-semibold text-white/90 mb-1">{t.hero.subtitle}</p>
              <p className="text-xs text-white/50 mb-4">{t.hero.desc}</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-extrabold tracking-tight mb-1.5 leading-tight">
                <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
                  {isZh ? "🎰 买券抽大奖" : "🎰 Buy & Win Big"}
                </span>
              </h1>
              <p className="text-sm font-semibold text-white/90 mb-1">
                {isZh
                  ? "100% 中奖 · 即时到账 · 倒计时赢大奖"
                  : "100% Win · Instant Cash · Countdown Grand Prize"}
              </p>
              <p className="text-xs text-white/50 mb-4 leading-snug">
                {isZh
                  ? "买券抽一次即时奖，余额到店花；核销进大奖池，看倒计时开奖"
                  : "Buy → instant win + spendable balance · redeems fund the countdown pool"}
              </p>
            </>
          )}

          {/* 主 CTA 跟角色 Tab；首页通用，不挂具体商家活动 */}
          {roleView === "consumer" ? (
            <div className="flex flex-col items-center gap-2">
              {session?.role === "customer" ? (
                <Link
                  href="/home"
                  className="inline-flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-bold text-sm shadow-lg shadow-orange-300/30 hover:from-amber-500 hover:to-orange-600 transition-all active:scale-[0.98]"
                >
                  {isZh ? "进入我的首页" : "Go to my home"}
                  <span className="text-base">→</span>
                </Link>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Link
                    href="/auth/register"
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-bold text-sm shadow-lg shadow-orange-300/30 hover:from-amber-500 hover:to-orange-600 transition-all active:scale-[0.98]"
                  >
                    🎰 {isZh ? "免费注册" : "Sign up free"}
                  </Link>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center justify-center px-7 py-2.5 text-white/80 rounded-full font-medium text-sm border border-white/20 hover:bg-white/10 hover:text-white transition-all"
                  >
                    {t.nav.login}
                  </Link>
                </div>
              )}
              {(session?.role === "business" || session?.role === "staff") && (
                <p className="text-[10px] text-white/40 mt-0.5">
                  {isZh
                    ? "当前是商家登录 · 管店请点上方「我是商家」"
                    : "Logged in as business · switch to For Business to manage"}
                </p>
              )}
            </div>
          ) : session?.role === "business" || session?.role === "staff" ? (
            <Link
              href="/business"
              className="inline-flex items-center gap-2 px-7 py-2.5 bg-white text-slate-900 rounded-full font-semibold text-sm shadow-lg shadow-black/20 hover:bg-white/95 transition-all active:scale-[0.98]"
            >
              {t.nav.dashboard}
              <span className="text-base">→</span>
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center px-7 py-2.5 bg-white text-slate-900 rounded-full font-semibold text-sm shadow-lg shadow-black/20 hover:bg-white/95 transition-all active:scale-[0.98]"
              >
                {t.hero.cta}
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center px-7 py-2.5 text-white/70 rounded-full font-medium text-sm border border-white/15 hover:bg-white/10 hover:text-white transition-all"
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
            {lang === "zh" ? "核心能力" : "What you get"}
          </h2>
          <p className="text-sm text-slate-400">
            {lang === "zh" ? "代金券发得出 · 抽奖玩得动 · 到店核销" : "Vouchers · lucky draws · in-store redeem"}
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
            {lang === "zh" ? "注册企业 → 发券/开抽奖 → 门店贴码" : "Company → vouchers & draws → store QR"}
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

// Prize card config — real product images from Unsplash
const GRAND_PRIZES = [
  {
    key: "iPad", emoji: "📲", labelZh: "iPad", labelEn: "iPad",
    targetSgd: "3,000", targetCents: 300000,
    img: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&h=400&fit=crop&auto=format",
    color: "from-slate-600 to-slate-800", accent: "#6e6e73",
  },
  {
    key: "iPhone", emoji: "📱", labelZh: "iPhone 17", labelEn: "iPhone 17",
    targetSgd: "5,000", targetCents: 500000,
    img: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=400&fit=crop&auto=format",
    color: "from-slate-700 to-slate-900", accent: "#0071e3",
  },
  {
    key: "BYD", emoji: "🚗", labelZh: "BYD 海豹", labelEn: "BYD Seal",
    targetSgd: "667,000", targetCents: 66700000,
    img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=400&fit=crop&auto=format",
    color: "from-red-700 to-red-900", accent: "#e31837",
  },
];

function CountdownBadge({ days, isZh }: { days: number | undefined; isZh: boolean }) {
  if (days === undefined) return null;
  if (days <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-bold animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {isZh ? "即将开奖" : "SOON"}
      </span>
    );
  }
  if (days <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[10px] font-bold">
        {isZh ? `仅剩 ${days} 天` : `${days} days left`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold">
      {isZh ? `预计 ${days} 天` : `~${days} days`}
    </span>
  );
}

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
      {/* ══════ Section 1 — Scenario Demo（更清晰的三步） ══════ */}
      <section className="relative -mt-5 px-4 pb-4">
        <div className="max-w-sm mx-auto">
          <div className="bg-white rounded-2xl shadow-md border border-amber-100/80 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 flex items-center justify-center">
              <span className="text-white text-[11px] font-bold tracking-wide">
                {isZh ? "💡 三步看懂怎么玩" : "💡 How it works in 3 steps"}
              </span>
            </div>
            <div className="p-3 space-y-2.5">
              {/* Numbered steps — clearer than 3 equal boxes */}
              <ol className="space-y-2">
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">
                      {isZh ? "PayNow 买预付券" : "PayNow buy prepaid voucher"}
                      <span className="ml-1.5 text-slate-500 font-bold">S$100</span>
                    </p>
                    <p className="text-[10px] text-slate-500 leading-snug">
                      {isZh
                        ? "入账余额 = 实付金额，可跨店花，用不完可提现"
                        : "Balance = amount paid · network spend · withdrawable"}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                    2
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">
                      {isZh ? "100% 抽即时小奖" : "100% instant small prize"}
                      <span className="ml-1.5 text-emerald-600 font-bold">🎉 +S$10</span>
                    </p>
                    <p className="text-[10px] text-slate-500 leading-snug">
                      {isZh
                        ? "购券当场开奖，必中小奖（示例）"
                        : "Draw right after purchase — guaranteed small win (example)"}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                    3
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">
                      {isZh ? "到店花余额 · 冲大奖池" : "Spend in-store · fund grand pool"}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-snug">
                      {isZh
                        ? "核销金额约 20% 进奖池；核销越多，大奖权重越高"
                        : "~20% of each redeem funds prizes; more spend → higher weight"}
                    </p>
                  </div>
                </li>
              </ol>

              {/* Mini money strip */}
              <div className="flex items-center justify-between gap-1 rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 text-center">
                <div className="flex-1">
                  <p className="text-[9px] text-slate-400">{isZh ? "你付" : "You pay"}</p>
                  <p className="text-sm font-extrabold text-slate-800">S$100</p>
                </div>
                <span className="text-slate-300 text-xs">→</span>
                <div className="flex-1">
                  <p className="text-[9px] text-slate-400">{isZh ? "余额可花" : "Balance"}</p>
                  <p className="text-sm font-extrabold text-blue-600">S$100</p>
                </div>
                <span className="text-slate-300 text-xs">+</span>
                <div className="flex-1">
                  <p className="text-[9px] text-slate-400">{isZh ? "即时奖" : "Instant"}</p>
                  <p className="text-sm font-extrabold text-emerald-600">S$10</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ Section 2 — Grand Prize Countdown Cards ══════ */}
      <section className="px-5 pb-6">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold text-slate-900">
              🏆 {isZh ? "大奖池倒计时" : "Grand Prize Countdown"}
            </h2>
            {mainDraw && (
              <span className="text-[10px] text-slate-400">
                {isZh ? "奖池 " : "Pool "}S${mainDraw.totalPoolSgd}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {GRAND_PRIZES.map((prize) => {
              const cd = mainDraw?.countdown?.find((c: any) => c.prizeName === prize.key) || null;
              const currentSgd = cd?.currentSgd || "0";
              const targetSgd = cd?.targetSgd || prize.targetSgd.replace(",", "");
              const pct = cd?.progress || 0;
              const days = cd?.daysPredicted;
              const accelerating = cd?.accelerating || false;
              const currentNum = parseInt(String(currentSgd).replace(/,/g, "")) || 0;
              const targetNum = parseInt(String(targetSgd).replace(/,/g, "")) || 1;

              return (
                <div key={prize.key} className="relative bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Product image strip */}
                  <div className="relative h-32 bg-gradient-to-r from-slate-800 to-slate-900 overflow-hidden">
                    <img
                      src={prize.img}
                      alt={prize.labelEn}
                      className="absolute inset-0 w-full h-full object-cover opacity-70"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* Gradient overlay */}
                    <div className={`absolute inset-0 bg-gradient-to-r ${prize.color} opacity-50`} />
                    {/* Prize label overlay */}
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                      <div>
                        <p className="text-white/70 text-[10px] font-medium uppercase tracking-wide">
                          {isZh ? "大奖" : "GRAND PRIZE"}
                        </p>
                        <p className="text-white text-xl font-extrabold">
                          {prize.emoji} {isZh ? prize.labelZh : prize.labelEn}
                        </p>
                      </div>
                      <CountdownBadge days={days} isZh={isZh} />
                      {accelerating && (
                        <span className="absolute top-3 right-3 px-2 py-0.5 bg-green-400/90 text-white rounded-full text-[9px] font-bold">
                          🚀 {isZh ? "加速中" : "ACCEL"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress + stats */}
                  <div className="p-4">
                    {/* Big progress bar */}
                    <div className="mb-2">
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>
                          {isZh ? "已筹" : "Raised"} <b className="text-slate-700">S${Number(currentSgd).toLocaleString()}</b>
                        </span>
                        <span>
                          {isZh ? "目标" : "Goal"} <b className="text-slate-700">S${Number(targetSgd).toLocaleString()}</b>
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            background: `linear-gradient(90deg, ${prize.accent}cc, ${prize.accent})`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Bottom stats row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold" style={{ color: prize.accent }}>
                        {Math.min(100, Math.max(0, pct)).toFixed(1)}%
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        {days !== undefined && days > 0 && (
                          <span>
                            {isZh ? "每天约" : "~"} S${Math.max(1, Math.round(currentNum / Math.max(1, days))).toLocaleString()}
                            {isZh ? "/天" : "/day"}
                          </span>
                        )}
                        <span>
                          {isZh ? "大奖池抽取" : "Grand pool draw"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-5 text-center">
            <a
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 px-10 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full font-bold text-sm shadow-lg shadow-orange-200 hover:from-amber-600 hover:to-orange-600 transition-all active:scale-[0.98]"
            >
              🎰 {isZh ? "免费注册，立即抽奖" : "Sign Up Free & Win Now"}
            </a>
            <p className="text-[10px] text-slate-400 mt-2">
              {isZh ? "100% 中奖 · 零成本参与 · 随时提现" : "100% Win · Free to Join · Cash Out Anytime"}
            </p>
          </div>
        </div>
      </section>

      {/* ══════ Section 3 — Hot Coupons (Premium Black-Gold) ══════ */}
      {loaded && coupons.length > 0 && (
        <section className="px-5 pt-2 pb-6 max-w-sm mx-auto">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-600 font-bold mb-1">
                {isZh ? "🔥 热门代金券" : "🔥 HOT VOUCHERS"}
              </p>
              <h2 className="text-base font-extrabold text-slate-900">
                {isZh ? "黑金甄选" : "Black Gold Selection"}
              </h2>
            </div>
            <a href="/home" className="text-[11px] text-amber-600 font-semibold hover:text-amber-700 transition-colors">
              {isZh ? "查看更多 →" : "View All →"}
            </a>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-3 -mx-1 px-1 snap-x scrollbar-none">
            {coupons.map((c: any) => (
              <PremiumCouponCard key={c.id} coupon={c} isZh={isZh} />
            ))}
          </div>
        </section>
      )}

      {/* ══════ For Business Entry ══════ */}
      <section className="px-5 pb-14 max-w-sm mx-auto">
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
