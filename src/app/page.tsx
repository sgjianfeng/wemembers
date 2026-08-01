"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { TopHeader } from "@/components/ui/TopHeader";
import { LandingActivityFeed } from "@/components/customer/LandingActivityFeed";

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
        bg: "bg-blue-50 dark:bg-blue-950/35",
        text: "text-blue-700 dark:text-blue-400",
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
        bg: "bg-emerald-50 dark:bg-emerald-950/35",
        text: "text-emerald-700 dark:text-emerald-400",
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
        bg: "bg-blue-50 dark:bg-blue-950/35",
        text: "text-blue-700 dark:text-blue-400",
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
        bg: "bg-emerald-50 dark:bg-emerald-950/35",
        text: "text-emerald-700 dark:text-emerald-400",
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
  const isZh = lang === "zh";
  const isCustomer = session?.role === "customer";
  const isMerchant =
    session?.role === "business" || session?.role === "staff";

  // 商家会话访问用户注册/登录前先退出，避免 middleware 踢回 /business
  const custRegisterHref = isMerchant
    ? `/api/auth/logout?next=${encodeURIComponent("/auth/register?role=customer")}`
    : "/auth/register?role=customer";
  const custLoginHref = isMerchant
    ? `/api/auth/logout?next=${encodeURIComponent("/auth/login?tab=customer")}`
    : "/auth/login?tab=customer";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.data?.id) setSession(d.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/*
        产品 IA：/ = 消费者站；商家站 = /for-business
        不再用「我是消费者 / 我是商家」双 Tab 混在同一首页
      */}
      <TopHeader variant="landing">
        {isCustomer ? (
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
        ) : (
          <Link
            href={custLoginHref}
            className="text-xs font-medium text-white/85 hover:text-white transition-colors px-2 py-1 rounded-full border border-white/20"
          >
            {t.nav.login}
          </Link>
        )}
      </TopHeader>

      {/* ── Hero：仅消费者 ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 px-4 pt-4 pb-14 text-white">
        <div className="absolute top-[-80px] right-[-60px] w-56 h-56 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-40px] left-[-40px] w-48 h-48 bg-violet-500/15 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-sm mx-auto text-center">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-medium text-white/75 backdrop-blur mb-3">
            {t.hero.badge}
          </span>

          <h1 className="text-3xl font-extrabold tracking-tight mb-1.5 leading-tight">
            <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
              {isZh ? "发现热门活动" : "Discover activities"}
            </span>
          </h1>
          <p className="text-sm font-semibold text-white/90 mb-1">
            {isZh
              ? "满赠 · 代金 · 抽奖 · 按活动选券"
              : "Gifts · vouchers · draws · by activity"}
          </p>
          <p className="text-xs text-white/50 mb-5 leading-snug">
            {isZh
              ? "搜索活动或门店，展开活动卡看看有哪些券可以买、可以领"
              : "Search activities or stores · open a card to pick vouchers"}
          </p>

          {isCustomer ? (
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
                href={custRegisterHref}
                className="inline-flex items-center justify-center gap-2 px-8 py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full font-bold text-sm shadow-lg shadow-orange-300/30 hover:from-amber-500 hover:to-orange-600 transition-all active:scale-[0.98]"
              >
                🎰 {isZh ? "免费注册" : "Sign up free"}
              </Link>
              <Link
                href={custLoginHref}
                className="inline-flex items-center justify-center px-7 py-2.5 text-white/80 rounded-full font-medium text-sm border border-white/20 hover:bg-white/10 hover:text-white transition-all"
              >
                {t.nav.login}
              </Link>
            </div>
          )}
          {isMerchant && (
            <p className="text-[10px] text-white/40 mt-2">
              {isZh
                ? "检测到商家会话：点注册/登录会先退出商家再进入用户流程"
                : "Merchant session detected — register/login will switch to customer"}
            </p>
          )}
        </div>
      </section>

      {/* 热门活动卡 + 搜索（活动 + 活动内券） */}
      <div className="relative -mt-4">
        <LandingActivityFeed isZh={isZh} isLoggedIn={!!isCustomer} />
      </div>

      {/* ── Footer：消费者站底部商家入口 ── */}
      <footer className="px-5 pb-10 pt-4 text-center border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">{t.footer}</p>
        <Link
          href="/for-business"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[#1A6EFF] transition-colors"
        >
          {isZh ? "我是商家 · 入驻与发券 →" : "For business · Issue vouchers →"}
        </Link>
      </footer>
    </div>
  );
}

