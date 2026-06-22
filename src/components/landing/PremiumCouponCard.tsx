"use client";

// ──── Premium Coupon Card — Black-Gold Luxury Style ────
// Used on the landing page, horizontal scroll

interface CouponData {
  id: string;
  title: string;
  type: string;
  valueCents: number;
  pointsRequired: number;
  business?: { businessName: string; businessLogo?: string | null; businessCategory?: string | null } | null;
  claimedCount?: number;
  totalQuantity?: number | null;
  remainingQuantity?: number | null;
  color?: string | null;
  giftType?: string;
}

// Subtle dark gradient palettes — each card gets a random one for variety
const BG_GRADIENTS = [
  "from-[#1a1c24] via-[#181f2e] to-[#141720]",  // navy-black
  "from-[#1c1a1c] via-[#221a22] to-[#16101c]",  // aubergine-black
  "from-[#191e1a] via-[#162a20] to-[#0e1a14]",  // forest-black
  "from-[#1a1d1c] via-[#1a2428] to-[#121a1e]",  // teal-black
  "from-[#1d1a18] via-[#241e18] to-[#1a1410]",  // bronze-black
];

// Metallic gold accent palettes
const GOLD_ACCENTS = [
  { from: "#f7d98c", via: "#e2b95c", to: "#c49b3f" },  // classic gold
  { from: "#f0d7a0", via: "#dbaa44", to: "#bf9530" },  // warm gold
  { from: "#e8d5b0", via: "#d4a853", to: "#b8943a" },  // champagne
  { from: "#f5dea0", via: "#e0c060", to: "#c8a840" },  // bright gold
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function PremiumCouponCard({ coupon, isZh }: { coupon: CouponData; isZh: boolean }) {
  const bizName = coupon.business?.businessName || "";
  const idx = hashId(coupon.id) % BG_GRADIENTS.length;
  const bgGrad = BG_GRADIENTS[idx];
  const gold = GOLD_ACCENTS[idx % GOLD_ACCENTS.length];

  // ── Display value ──
  const isFixed = coupon.type === "fixed_amount";
  const isPct = coupon.type === "percentage";
  const isFree = coupon.type === "free_item";

  const rawValue = coupon.valueCents / 100;
  const heroValue = isPct
    ? `${rawValue.toFixed(0)}`
    : isFree
    ? (isZh ? "免单" : "FREE")
    : `${rawValue.toFixed(0)}`;  // plain number — currency label shown above

  const heroSuffix = isPct ? (isZh ? "折" : "% OFF") : "";
  const isLargeNumber = isFixed && rawValue >= 1000;

  // ── Progress ──
  const total = coupon.totalQuantity || 0;
  const claimed = coupon.claimedCount || 0;
  const claimedPct = total > 0 ? Math.min(100, Math.round((claimed / total) * 100)) : 0;
  const remaining = coupon.remainingQuantity;

  // ── Scarcity label ──
  let scarcityLabel: string | null = null;
  if (remaining != null && remaining <= 10 && remaining > 0) {
    scarcityLabel = isZh ? `仅剩 ${remaining} 张` : `Only ${remaining} left`;
  } else if (claimedPct >= 80) {
    scarcityLabel = isZh ? "即将抢光" : "Almost gone";
  }

  return (
    <a
      href={`/coupons/${coupon.id}`}
      className={`snap-start shrink-0 w-40 rounded-2xl overflow-hidden border border-white/[0.08]
        bg-gradient-to-br ${bgGrad}
        hover:scale-[1.03] hover:-translate-y-0.5
        hover:border-amber-400/30 hover:shadow-xl hover:shadow-amber-500/10
        transition-all duration-300 group cursor-pointer no-underline
        relative`}
    >
      {/* ════ Subtle surface gloss — light hit from top-left ════ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 20% 15%, rgba(255,255,255,0.05) 0%, transparent 55%)`,
        }}
      />

      <div className="relative p-3.5 flex flex-col h-full">
        {/* ── Top: card chip + business ── */}
        <div className="flex items-center gap-2 mb-2">
          {/* Simulated EMV chip */}
          <div className="flex -space-x-0.5 shrink-0 items-center">
            <span className="w-1.5 h-2.5 rounded-[2px] bg-gradient-to-b from-amber-200/60 to-amber-500/30" />
            <span className="w-1.5 h-2.5 rounded-[2px] bg-gradient-to-b from-amber-300/50 to-amber-500/20" />
            <span className="w-1 h-2.5 rounded-[1px] bg-gradient-to-b from-amber-200/40 to-amber-500/15 ml-0.5" />
          </div>
          <span className="text-[10px] text-white/35 truncate leading-tight font-medium tracking-wide uppercase">
            {bizName}
          </span>
        </div>

        {/* ── Middle: HERO VALUE ── */}
        <div className="flex-1 flex flex-col justify-center items-center py-2">
          {/* Currency label (fixed_amount only) */}
          {isFixed && (
            <p className="text-[10px] font-semibold text-amber-300/60 leading-none mb-0.5 tracking-[0.2em] uppercase">
              SGD
            </p>
          )}
          <p
            className={`${isFree ? "text-lg" : isLargeNumber ? "text-2xl" : "text-3xl"} font-black leading-none tracking-tighter`}
            style={{
              background: `linear-gradient(135deg, ${gold.from} 0%, ${gold.via} 40%, ${gold.to} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 1px 3px rgba(200,160,60,0.3))",
            }}
          >
            {heroValue}
            {heroSuffix ? (
              <span className="text-xs font-bold tracking-normal ml-0.5">{heroSuffix}</span>
            ) : null}
          </p>
        </div>

        {/* ── Thin gold divider ── */}
        <div className="w-full h-px mb-2.5" style={{ background: `linear-gradient(90deg, transparent, ${gold.via}30, ${gold.via}50, ${gold.via}30, transparent)` }} />

        {/* ── Bottom: title + info ── */}
        <p className="text-[11px] text-white/75 font-medium leading-snug line-clamp-2 mb-2">
          {coupon.title}
        </p>

        {/* ── Points + Scarcity row ── */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300/70 font-semibold">
            ⭐ {coupon.pointsRequired}
          </span>
          {scarcityLabel && (
            <span className="text-[9px] text-red-400/80 font-semibold animate-pulse">
              {scarcityLabel}
            </span>
          )}
        </div>

        {/* ── Progress bar ── */}
        {total > 0 && (
          <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(4, claimedPct)}%`,
                background: `linear-gradient(90deg, ${gold.from}cc, ${gold.via})`,
              }}
            />
          </div>
        )}
        {!total && (
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: "100%",
                background: `linear-gradient(90deg, ${gold.from}20, ${gold.via}30)`,
              }}
            />
          </div>
        )}

        {/* ── Gift badge ── */}
        {coupon.giftType && coupon.giftType !== "none" && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-300/70 border border-amber-400/15 font-medium">
              🎁 {isZh ? "赠礼" : "Gift"}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
