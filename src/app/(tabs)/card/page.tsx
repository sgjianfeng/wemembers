import { getSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Star, CreditCard } from "lucide-react";
import { formatSgd } from "@/lib/utils";
import {
  getCustomerBrandCards,
  totalSpendableCents,
} from "@/lib/customer-brand-cards";

const TIER_LABEL: Record<string, { zh: string; en: string }> = {
  regular: { zh: "普通", en: "Regular" },
  silver: { zh: "银卡", en: "Silver" },
  gold: { zh: "金卡", en: "Gold" },
  platinum: { zh: "铂金", en: "Platinum" },
};

/**
 * 品牌卡 —— 顾客侧唯一的资产入口
 *
 * 券包（一次性权益券）与余额（储值券）过去是两个 tab，那是按**存储形式**分的，
 * 是数据库的分法。顾客要回答的是「我在这家店有什么」，跑两个 tab 才能拼出答案。
 * 这里按品牌聚合，一张卡答完。
 */
export default async function BrandCardsPage() {
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";
  const zh = lang !== "en";
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const cards = await getCustomerBrandCards(session.userId);
  const total = totalSpendableCents(cards);

  return (
    <div className="pb-6">
      <div className="px-4 pt-5 pb-4">
        <h1 className="text-lg font-semibold">{zh ? "我的卡" : "My cards"}</h1>
        {cards.length > 0 && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {zh
              ? `${cards.length} 个品牌 · 共可用 ${formatSgd(total)}`
              : `${cards.length} brands · ${formatSgd(total)} available`}
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-20 px-6">
          <div className="flex justify-center mb-4">
            <CreditCard size={56} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {zh ? "还没有任何品牌卡" : "No brand cards yet"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {zh
              ? "到店消费扫码，或领一张优惠券即可开卡"
              : "Scan at a store or claim a coupon to start"}
          </p>
          <Link
            href="/home"
            className="inline-block mt-4 px-6 py-2 bg-[#1A6EFF] text-white text-sm rounded-full"
          >
            {zh ? "去逛逛" : "Explore"}
          </Link>
        </div>
      ) : (
        <div className="px-4 space-y-2.5">
          {cards.map((b) => {
            const tier = b.membership
              ? TIER_LABEL[b.membership.tier] || TIER_LABEL.regular
              : null;
            const lines: string[] = [];
            if (b.cashbackCents > 0) {
              lines.push(
                `${zh ? "抵扣额度" : "Credit"} ${formatSgd(b.cashbackCents)}`
              );
            }
            if (b.purchaseCents > 0) {
              lines.push(
                `${zh ? "购券余额" : "Prepaid"} ${formatSgd(b.purchaseCents)}`
              );
            }
            if (b.prizeCents > 0) {
              lines.push(
                `${zh ? "中奖奖励" : "Prize"} ${formatSgd(b.prizeCents)}`
              );
            }
            if (b.couponCount > 0) {
              lines.push(
                zh ? `优惠券 ${b.couponCount} 张` : `${b.couponCount} coupons`
              );
            }

            return (
              <Link key={b.businessId} href={`/card/${b.businessId}`}>
                <Card className="hover:border-[#1A6EFF]/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1A6EFF] to-[#3B82F6] flex items-center justify-center text-white font-semibold shrink-0">
                        {b.businessName.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold truncate">
                            {b.businessName}
                          </p>
                          {b.membership?.isFavorite && (
                            <Star
                              size={13}
                              className="text-amber-500 fill-amber-500 shrink-0"
                            />
                          )}
                        </div>
                        {b.membership && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {zh ? tier?.zh : tier?.en} ·{" "}
                            {zh
                              ? `${b.membership.points} 积分`
                              : `${b.membership.points} pts`}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold tabular-nums">
                          {formatSgd(b.spendableCents)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {zh ? "可用" : "available"}
                        </p>
                      </div>
                    </div>

                    {lines.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-border flex flex-wrap gap-x-3 gap-y-1">
                        {lines.map((l) => (
                          <span
                            key={l}
                            className="text-[11px] text-muted-foreground"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
