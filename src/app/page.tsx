"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";

const zhContent = {
  heroTitle: "WeMembers",
  heroDesc: "会员 + 代金券 + 幸运抽奖\n一站式商户营销平台",
  signUp: "免费注册",
  login: "登录",
  goDashboard: "进入管理后台",
  goHome: "进入首页",
  startFree: "🎉 免费开始使用",
  launchTitle: "商家三分钟上手",
  launchDesc: "注册 → 创建券 → 贴二维码 → 客户扫码领券 → 核销 → 自动积分 → 抽奖参与",
  flowSteps: ["注册公司", "自动门店+Stripe", "创建代金券", "打印二维码", "客户扫码领券", "扫码核销", "自动积分升级", "抽奖参与"],
  pillars: [
    {
      icon: "🎫",
      title: "代金券系统",
      desc: "创建定额、折扣、免单券，客户用积分领取。支持跨店核销，自动分账结算。发券方赚推广费，核销方获客引流",
      features: ["三种券类型：定额/折扣/免单", "积分领取 · 限量控制 · 限时有效", "跨店核销 · 三方自动分账", "推广分销 · 佣金激励"],
      color: "from-[#FF6B35] to-orange-400",
    },
    {
      icon: "👥",
      title: "会员系统",
      desc: "四等级会员体系（普通/银卡/金卡/铂金），商家自定义门槛和权益。消费自动积分，签到奖励，积分流水全程可追溯",
      features: ["四级会员 · 商家自定义权益", "消费自动积分 · 签到叠加", "积分流水 · 等级进度可视化", "商家间会员数据隔离"],
      color: "from-[#1A6EFF] to-[#3B82F6]",
    },
    {
      icon: "🎰",
      title: "幸运抽奖",
      desc: "收据上传即时抽奖，奖池进度实时可见。延迟开奖攒大奖，比亚迪汽车做头奖。即时抽+延迟抽双模式，商家联合活动",
      features: ["收据上传 · 即时抽 SGD5-200", "延迟开奖 · 攒池等比亚迪", "即时奖池 + 大奖池双轨透明", "倒计时 · 速度追踪 · 中奖率 26%+"],
      color: "from-[#8B5CF6] to-[#A78BFA]",
    },
  ],
  footer: "Powered by WeMembers",
};

const enContent: typeof zhContent = {
  heroTitle: "WeMembers",
  heroDesc: "Membership + Vouchers + Lucky Draw\nAll-in-one merchant platform",
  signUp: "Sign Up Free",
  login: "Login",
  goDashboard: "Go to Dashboard",
  goHome: "Go to Home",
  startFree: "🎉 Start Free",
  launchTitle: "Launch in 3 Minutes",
  launchDesc: "Register → Create vouchers → Print QR → Customers scan & claim → Redeem → Auto points → Draw entry",
  flowSteps: ["Register", "Auto Store+Stripe", "Create Voucher", "Print QR", "Customer Claims", "Redeem", "Auto Points", "Draw Entry"],
  pillars: [
    {
      icon: "🎫",
      title: "Voucher System",
      desc: "Create fixed, discount, or free-item vouchers. Customers claim with points. Cross-store redemption with automatic settlement. Issuers earn promo fees, redeemers gain traffic",
      features: ["3 types: Fixed/Discount/Free Item", "Points claim · Quantity limit · Expiry", "Cross-store · Auto 3-way settlement", "Promoter system · Commission"],
      color: "from-[#FF6B35] to-orange-400",
    },
    {
      icon: "👥",
      title: "Membership",
      desc: "Four-tier membership (Regular/Silver/Gold/Platinum). Custom thresholds & benefits per business. Auto points on redemption, check-in rewards, full audit trail",
      features: ["4 tiers · Custom benefits", "Auto points · Check-in streaks", "Points log · Tier progress bar", "Per-business data isolation"],
      color: "from-[#1A6EFF] to-[#3B82F6]",
    },
    {
      icon: "🎰",
      title: "Lucky Draw",
      desc: "Receipt-based instant draw with real-time pool tracking. Deferred draw for grand prizes like BYD car. Dual mode: instant small wins + deferred jackpots. Multi-business campaigns",
      features: ["Receipt upload · Instant SGD5-200", "Deferred draw · Pool up for BYD", "Dual pool tracking · Transparent", "Countdown · Velocity · 26%+ win rate"],
      color: "from-[#8B5CF6] to-[#A78BFA]",
    },
  ],
  footer: "Powered by WeMembers",
};

export default function HomePage() {
  const { lang } = useLang();
  const [session, setSession] = useState<any>(null);
  const c = lang === "zh" ? zhContent : enContent;

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.data?.id) setSession(d.data);
    }).catch(() => {});
  }, []);

  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-gradient-to-b from-[#1A6EFF] via-[#3B82F6] to-white px-4 pt-12 pb-16 text-white">
        <div className="text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            WM
          </div>
          <h1 className="text-3xl font-bold">{c.heroTitle}</h1>
          <p className="text-white/70 text-base mt-2 leading-relaxed whitespace-pre-line">{c.heroDesc}</p>

          {isLoggedIn ? (
            <Link
              href={session.role === "business" ? "/business" : session.role === "customer" ? "/home" : "/auth/login"}
              className="inline-block mt-6 px-8 py-3 bg-white text-[#1A6EFF] rounded-full font-semibold text-sm shadow-lg"
            >
              {session.role === "business" ? c.goDashboard : c.goHome}
            </Link>
          ) : (
            <div className="flex gap-3 justify-center mt-6">
              <Link href="/auth/register" className="px-8 py-3 bg-white text-[#1A6EFF] rounded-full font-semibold text-sm shadow-lg">
                {c.signUp}
              </Link>
              <Link href="/auth/login" className="px-8 py-3 bg-white/20 text-white rounded-full font-semibold text-sm border border-white/30">
                {c.login}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Three Pillars */}
      <div className="px-4 -mt-8 pb-16">
        {c.pillars.map((p, i) => (
          <div key={i} className="mt-4">
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className={`bg-gradient-to-r ${p.color} px-5 py-4 text-white`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{p.icon}</span>
                  <h3 className="text-lg font-bold">{p.title}</h3>
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-500 leading-relaxed">{p.desc}</p>
                <div className="mt-3 space-y-1">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="text-[10px] text-green-500">✓</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Business workflow */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-slate-900 text-center mb-2">
            {c.launchTitle}
          </h2>
          <p className="text-xs text-slate-400 text-center mb-4">
            {c.launchDesc}
          </p>
          <div className="flex items-center justify-center gap-1.5 flex-wrap text-[10px] text-slate-400">
            {c.flowSteps.map((step, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="px-2 py-0.5 bg-slate-100 rounded-full">{step}</span>
                {i < c.flowSteps.length - 1 && <span className="text-slate-300">→</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 pb-8">
          <p className="text-xs text-slate-300">{c.footer}</p>
          {!isLoggedIn && (
            <Link href="/auth/register" className="inline-block mt-4 px-10 py-3 bg-[#1A6EFF] text-white rounded-full font-semibold text-sm">
              {c.startFree}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
