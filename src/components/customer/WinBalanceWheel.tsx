"use client";

/**
 * 购券后「点一下赢余额」：仪式感分段转盘 + claim-instant。
 */
import { LuckyWheel, type WheelSegment } from "@/components/customer/LuckyWheel";

export type WinPrize = {
  name: string;
  icon?: string;
  valueSgd?: string;
};

type Props = {
  lang: "zh" | "en";
  /** 已抽好的奖（购券返回）；无则点按后调 onClaim */
  prize: WinPrize | null;
  onClaim?: () => Promise<WinPrize | null>;
  onRevealed?: (prize: WinPrize) => void;
  className?: string;
  /** 档位即时奖上限（SGD），用于裁剪转盘扇区 */
  instantCapSgd?: number;
};

const ALL_PRIZES: Array<{
  valueCents: number;
  icon: string;
  weight: number;
  tone: WheelSegment["tone"];
}> = [
  { valueCents: 3000, icon: "💰", weight: 3, tone: "violet" },
  { valueCents: 2000, icon: "💵", weight: 6, tone: "emerald" },
  { valueCents: 1000, icon: "💵", weight: 14, tone: "sky" },
  { valueCents: 500, icon: "🎫", weight: 8, tone: "amber" },
  { valueCents: 200, icon: "🎟", weight: 15, tone: "rose" },
  { valueCents: 100, icon: "☕", weight: 35, tone: "amber" },
  { valueCents: 50, icon: "🍬", weight: 50, tone: "rose" },
];

function segmentsForCap(capSgd?: number): WheelSegment[] {
  const capCents =
    capSgd && capSgd > 0 ? Math.round(capSgd * 100) : 3000;
  const list = ALL_PRIZES.filter((p) => p.valueCents <= capCents);
  const use = list.length > 0 ? list : ALL_PRIZES.slice(-4);
  return use.map((p) => {
    const sgd = (p.valueCents / 100).toFixed(p.valueCents % 100 === 0 ? 0 : 2);
    return {
      id: `v-${p.valueCents}`,
      label: `S$${sgd}`,
      icon: p.icon,
      matchValueSgd: (p.valueCents / 100).toFixed(2),
      matchName: `S$${sgd} 代金券`,
      tone: p.tone,
    };
  });
}

export function WinBalanceWheel({
  lang,
  prize: initialPrize,
  onClaim,
  onRevealed,
  className,
  instantCapSgd,
}: Props) {
  const segments = segmentsForCap(instantCapSgd);

  return (
    <LuckyWheel
      lang={lang}
      theme="instant"
      className={className}
      segments={segments}
      title={lang === "en" ? "Instant prize wheel" : "即时小奖 · 幸运转盘"}
      subtitle={
        lang === "en"
          ? "100% win · prize adds to spendable balance in store"
          : "100% 中奖 · 奖金额加入到店可花余额"
      }
      ctaLabel={lang === "en" ? "Spin · win balance" : "转动 · 赢余额"}
      spinningLabel={lang === "en" ? "Luck is spinning…" : "好运转动中…"}
      doneLabel={
        lang === "en"
          ? "Added to your spendable balance"
          : "已加入可花余额 · 到店核销使用"
      }
      onSpin={async () => {
        let resolved = initialPrize;
        if (!resolved && onClaim) {
          resolved = await onClaim();
        }
        if (!resolved) return null;
        return {
          name: resolved.name,
          icon: resolved.icon,
          valueSgd: resolved.valueSgd,
          label: resolved.name,
        };
      }}
      onRevealed={(r) => {
        if (!r.name && !r.label) return;
        onRevealed?.({
          name: r.name || r.label || "",
          icon: r.icon,
          valueSgd: r.valueSgd,
        });
      }}
    />
  );
}
