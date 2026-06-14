"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLang } from "@/components/i18n/LanguageProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const zh = {
  heroTitle: "WeMembers",
  heroSub: "会员 + 代金券 + 幸运抽奖",
  heroTag: "一站式商户营销平台，三分钟上线",
  signUp: "免费注册",
  login: "登录",
  goDashboard: "进入管理后台",
  goHome: "进入首页",
  startFree: "🎉 免费开始使用",
  flowTitle: "商家三分钟上手",
  flowDesc: "注册 → 创建券 → 贴二维码 → 客户扫码领券 → 核销 → 自动积分 → 抽奖参与",
  flow: ["注册公司","自动门店+Stripe","创建代金券","打印二维码","客户扫码领券","扫码核销","自动积分升级","抽奖参与"],
  pillars: [
    { icon: "🎫", title: "代金券系统", desc: "创建定额、折扣、免单券，客户积分领取。跨店核销，自动三方分账。发券方赚推广费，核销方获客引流", tags: ["定额/折扣/免单","积分领取 · 限量","跨店核销 · 分账","推广分销 · 佣金"] },
    { icon: "👥", title: "会员系统", desc: "四级会员体系，商家自定义门槛和权益。消费自动积分，签到奖励，积分流水全程可追溯", tags: ["四级会员 · 自定义","消费积分 · 签到","积分流水 · 进度","数据隔离"] },
    { icon: "🎰", title: "幸运抽奖", desc: "收据上传即时抽奖，奖池实时可见。延迟开奖攒大奖，比亚迪汽车做头奖。双模式商家联合活动", tags: ["收据上传 · 即时抽","延迟开奖 · 比亚迪","双轨透明奖池","中奖率 26%+"] },
  ],
  footer: "Powered by WeMembers",
};

const en = {
  heroTitle: "WeMembers",
  heroSub: "Membership + Vouchers + Lucky Draw",
  heroTag: "All-in-one merchant platform. Launch in 3 minutes.",
  signUp: "Sign Up Free",
  login: "Login",
  goDashboard: "Go to Dashboard",
  goHome: "Go to Home",
  startFree: "🎉 Start Free",
  flowTitle: "Launch in 3 Minutes",
  flowDesc: "Register → Create vouchers → Print QR → Scan & claim → Redeem → Auto points → Draw entry",
  flow: ["Register","Auto Store+Stripe","Create Voucher","Print QR","Customer Claims","Redeem","Auto Points","Draw Entry"],
  pillars: [
    { icon: "🎫", title: "Voucher System", desc: "Fixed, discount & free-item vouchers. Cross-store redemption with automatic 3-way settlement. Issuers earn promo fees, redeemers gain traffic", tags: ["Fixed/Discount/Free","Points claim · Limited","Cross-store · Settlement","Promoter · Commission"] },
    { icon: "👥", title: "Membership", desc: "Four-tier membership with custom thresholds & benefits. Auto points on redemption, check-in rewards, complete audit trail", tags: ["4 Tiers · Custom","Auto Points · Check-in","Points Log · Progress","Data Isolation"] },
    { icon: "🎰", title: "Lucky Draw", desc: "Receipt-based instant draw with real-time pool. Deferred draws for BYD-level prizes. Dual-mode for multi-business campaigns", tags: ["Receipt · Instant SGD5-200","Deferred · BYD Prize","Dual Pool Tracking","26%+ Win Rate"] },
  ],
  footer: "Powered by WeMembers",
};

export default function HomePage() {
  const { lang } = useLang();
  const c = lang === "zh" ? zh : en;
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.data?.id) setSession(d.data);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary to-primary/80 px-4 pt-14 pb-20 text-primary-foreground">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl font-bold shadow-inner">
            WM
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{c.heroTitle}</h1>
          <p className="text-primary-foreground/70 text-lg mt-3 font-medium">{c.heroSub}</p>
          <p className="text-primary-foreground/50 text-sm mt-1.5">{c.heroTag}</p>

          {session ? (
            <Link
              href={session.role === "business" ? "/business" : session.role === "customer" ? "/home" : "/auth/login"}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all duration-200 h-12 px-8 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-lg mt-7"
            >
              {session.role === "business" ? c.goDashboard : c.goHome}
            </Link>
          ) : (
            <div className="flex gap-3 justify-center mt-7">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all duration-200 h-12 px-8 text-base bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-lg"
              >
                {c.signUp}
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium ring-offset-background transition-all duration-200 h-12 px-8 text-base border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
              >
                {c.login}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Pillars */}
      <section className="px-4 -mt-8 pb-16 space-y-4">
        {c.pillars.map((p, i) => (
          <Card key={i} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardContent>
              <div className="flex items-center gap-3 text-lg font-semibold mb-1">
                <span className="text-2xl">{p.icon}</span>
                <span>{p.title}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{p.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {p.tags.map((tag, j) => (
                  <Badge key={j} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Flow */}
        <Card className="border-dashed border-border/50 mt-6">
          <CardContent className="py-6 text-center">
            <h2 className="text-lg font-bold mb-2">{c.flowTitle}</h2>
            <p className="text-sm text-muted-foreground mb-4">{c.flowDesc}</p>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {c.flow.map((step, i) => (
                <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-normal">{step}</Badge>
                  {i < c.flow.length - 1 && <span className="text-border">→</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer CTA */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs text-muted-foreground">{c.footer}</p>
          {!session && (
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all duration-200 h-12 px-10 text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg mt-4"
            >
              {c.startFree}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
