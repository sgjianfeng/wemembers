/**
 * Prize packs — default prize structure attached to draw templates.
 * Template = mechanics + economics; prize pack = what customers can win.
 * Future packs (light daily, festival, store-SKU) plug in without renaming templates.
 */

export type PrizePackId = "default_grand_v1" | "none";

export interface InstantPrizeDef {
  nameZh: string;
  nameEn: string;
  icon: string;
  valueCents: number;
  weight: number;
}

export interface GrandPrizeDef {
  id: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  /** Progress bar target (marketing pool target) */
  targetCents: number;
  /** Nominal prize value for display / cost planning */
  valueCents: number;
  /** true = requires platform escrow / flagship only before display */
  requiresEscrow: boolean;
}

export interface DrawMechanics {
  /** 100% instant win */
  instantWinRate: 100;
  /** Instant prize value capped by voucher tier */
  instantCapByTier: boolean;
  /** entry tier (S$50) also enters grand pool with 1× weight */
  smallTierGrandPool: boolean;
  /** medium: 1× face base weight; large: 2× */
  grandWeightMode: "tier_face_and_balance";
  shareBoostEnabled: true;
  /** Instant small prize now + delayed grand progress */
  drawStyle: "instant_plus_deferred_grand";
}

export interface PrizePack {
  id: PrizePackId;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  mechanics: DrawMechanics;
  instantPrizes: InstantPrizeDef[];
  grandPrizes: GrandPrizeDef[];
}

/** Default pack for 梦想大奖池 — progressive dreams; car-level requires escrow narrative */
export const PRIZE_PACK_DEFAULT_GRAND_V1: PrizePack = {
  id: "default_grand_v1",
  nameZh: "默认梦想大奖包",
  nameEn: "Default dream grand pack",
  descriptionZh:
    "即时必中小额券；购券余额全额可用；到店核销 20% 进延迟大奖池。汽车级目标仅作旗舰展示，需托管/资金到位。",
  descriptionEn:
    "Guaranteed small instant vouchers; full balance at buy; 20% of each redeem funds deferred prizes. Car-level targets need escrow.",
  mechanics: {
    instantWinRate: 100,
    instantCapByTier: true,
    smallTierGrandPool: true,
    grandWeightMode: "tier_face_and_balance",
    shareBoostEnabled: true,
    drawStyle: "instant_plus_deferred_grand",
  },
  instantPrizes: [
    { nameZh: "S$30 代金券", nameEn: "S$30 voucher", icon: "💰", valueCents: 3000, weight: 3 },
    { nameZh: "S$20 代金券", nameEn: "S$20 voucher", icon: "💵", valueCents: 2000, weight: 6 },
    { nameZh: "S$10 代金券", nameEn: "S$10 voucher", icon: "💵", valueCents: 1000, weight: 14 },
    { nameZh: "S$5 代金券", nameEn: "S$5 voucher", icon: "🎫", valueCents: 500, weight: 8 },
    { nameZh: "S$2 代金券", nameEn: "S$2 voucher", icon: "🎟", valueCents: 200, weight: 15 },
    { nameZh: "S$1 代金券", nameEn: "S$1 voucher", icon: "☕", valueCents: 100, weight: 35 },
    { nameZh: "S$0.50 代金券", nameEn: "S$0.50 voucher", icon: "🍬", valueCents: 50, weight: 50 },
  ],
  grandPrizes: [
    {
      id: "ipad",
      nameZh: "iPad",
      nameEn: "iPad",
      icon: "📲",
      targetCents: 300_000,
      valueCents: 80_000,
      requiresEscrow: false,
    },
    {
      id: "iphone",
      nameZh: "iPhone",
      nameEn: "iPhone",
      icon: "📱",
      targetCents: 500_000,
      valueCents: 150_000,
      requiresEscrow: false,
    },
    {
      id: "byd",
      nameZh: "BYD 梦想座驾",
      nameEn: "BYD dream car",
      icon: "🚗",
      targetCents: 66_700_000,
      valueCents: 20_000_000,
      requiresEscrow: true,
    },
  ],
};

export const PRIZE_PACKS: Record<PrizePackId, PrizePack | null> = {
  default_grand_v1: PRIZE_PACK_DEFAULT_GRAND_V1,
  none: null,
};

export function getPrizePack(id: PrizePackId | string | null | undefined): PrizePack | null {
  if (!id || id === "none") return null;
  return PRIZE_PACKS[id as PrizePackId] ?? null;
}

/** Compact snapshot for Campaign.rulesSnapshot (avoid huge duplicate lists if needed later) */
export interface PrizePackSnapshot {
  prizePackId: PrizePackId;
  drawStyle?: DrawMechanics["drawStyle"];
  grandPrizeIds?: string[];
  requiresEscrowGrandIds?: string[];
}

export function snapshotPrizePack(id: PrizePackId): PrizePackSnapshot | null {
  const pack = getPrizePack(id);
  if (!pack) return { prizePackId: "none" };
  return {
    prizePackId: pack.id,
    drawStyle: pack.mechanics.drawStyle,
    grandPrizeIds: pack.grandPrizes.map((g) => g.id),
    requiresEscrowGrandIds: pack.grandPrizes.filter((g) => g.requiresEscrow).map((g) => g.id),
  };
}

/** Store-editable grand prize row (countdown algorithm stays the same) */
export interface CampaignGrandPrize {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  valueCents: number;
  requiresEscrow: boolean;
}

export const GRAND_PRIZE_EDIT_LIMITS = {
  minCount: 1,
  maxCount: 5,
  minTargetCents: 10_000, // S$100
  maxTargetCents: 100_000_000, // S$1,000,000
  maxNameLength: 40,
} as const;

const PRIZE_ICON_ALLOW = new Set([
  "📲", "📱", "🚗", "🎁", "💻", "🎧", "⌚", "🎮", "☕", "🍰", "🎫", "🏆", "💎", "🛵", "🧴",
]);

/**
 * Normalize store-provided grand prizes.
 * - Keeps countdown math unchanged (only labels/targets)
 * - Clamps target into platform limits
 * - Defaults from prize pack when input empty
 */
export function normalizeCampaignGrandPrizes(
  prizePackId: PrizePackId,
  input?: Partial<CampaignGrandPrize>[] | null
): CampaignGrandPrize[] {
  const pack = getPrizePack(prizePackId);
  const defaults: CampaignGrandPrize[] = (pack?.grandPrizes || []).map((g) => ({
    id: g.id,
    name: g.nameZh,
    icon: g.icon,
    targetCents: g.targetCents,
    valueCents: g.valueCents,
    requiresEscrow: g.requiresEscrow,
  }));

  const raw = Array.isArray(input) && input.length > 0 ? input : defaults;
  const limited = raw.slice(0, GRAND_PRIZE_EDIT_LIMITS.maxCount);
  const out: CampaignGrandPrize[] = [];

  for (let i = 0; i < limited.length; i++) {
    const row = limited[i] || {};
    const fallback = defaults[i] || defaults[0];
    const id =
      (typeof row.id === "string" && row.id.trim()) ||
      fallback?.id ||
      `prize_${i + 1}`;
    let name = (typeof row.name === "string" ? row.name : fallback?.name || `奖品 ${i + 1}`).trim();
    if (!name) name = fallback?.name || `奖品 ${i + 1}`;
    if (name.length > GRAND_PRIZE_EDIT_LIMITS.maxNameLength) {
      name = name.slice(0, GRAND_PRIZE_EDIT_LIMITS.maxNameLength);
    }
    let icon = typeof row.icon === "string" && row.icon ? row.icon : fallback?.icon || "🎁";
    if (!PRIZE_ICON_ALLOW.has(icon)) icon = "🎁";

    let targetCents =
      typeof row.targetCents === "number" && Number.isFinite(row.targetCents)
        ? Math.round(row.targetCents)
        : fallback?.targetCents || 100_000;
    targetCents = Math.min(
      GRAND_PRIZE_EDIT_LIMITS.maxTargetCents,
      Math.max(GRAND_PRIZE_EDIT_LIMITS.minTargetCents, targetCents)
    );

    let valueCents =
      typeof row.valueCents === "number" && Number.isFinite(row.valueCents)
        ? Math.round(row.valueCents)
        : fallback?.valueCents || Math.round(targetCents * 0.3);
    valueCents = Math.max(0, Math.min(targetCents, valueCents));

    const requiresEscrow =
      typeof row.requiresEscrow === "boolean"
        ? row.requiresEscrow
        : targetCents >= 10_000_000 || !!fallback?.requiresEscrow;

    out.push({ id, name, icon, targetCents, valueCents, requiresEscrow });
  }

  if (out.length < GRAND_PRIZE_EDIT_LIMITS.minCount && defaults.length) {
    return defaults.slice(0, Math.max(GRAND_PRIZE_EDIT_LIMITS.minCount, 1));
  }
  return out;
}
