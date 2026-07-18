/** Re-exports helpers used by templates catalog UI (avoid circular imports). */
import {
  PRIZE_PACKS,
  PRIZE_PACK_DEFAULT_GRAND_V1,
  GRAND_PRIZE_EDIT_LIMITS,
  normalizeCampaignGrandPrizes,
  type PrizePackId,
  getPrizePack,
} from "@/lib/templates/prize-packs";

export {
  getPrizePack,
  PRIZE_PACK_DEFAULT_GRAND_V1,
  GRAND_PRIZE_EDIT_LIMITS,
  normalizeCampaignGrandPrizes,
};

export function listPrizePackSummaries() {
  return (Object.keys(PRIZE_PACKS) as PrizePackId[])
    .filter((id) => id !== "none" && PRIZE_PACKS[id])
    .map((id) => {
      const p = PRIZE_PACKS[id]!;
      return {
        id: p.id,
        nameZh: p.nameZh,
        nameEn: p.nameEn,
        descriptionZh: p.descriptionZh,
        grandPrizes: p.grandPrizes.map((g) => ({
          id: g.id,
          nameZh: g.nameZh,
          icon: g.icon,
          requiresEscrow: g.requiresEscrow,
        })),
        drawStyle: p.mechanics.drawStyle,
      };
    });
}
