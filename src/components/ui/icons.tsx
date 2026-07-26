/**
 * Central icon registry — map semantic names to lucide-react components.
 *
 * Why a string-keyed registry instead of passing the icon component directly:
 * Server Components (e.g. business/layout.tsx) build the nav config, and a
 * component/function reference cannot be serialized across the RSC → Client
 * boundary. Semantic string keys ARE serializable, so server layouts pass a
 * key and the client component resolves it here.
 *
 * This also gives the whole app one place to swap iconography (no more emoji).
 * Note lucide 1.x renamed some icons vs. older docs (Home → House).
 */
import {
  House,
  Ticket,
  TicketPercent,
  Wallet,
  CircleUser,
  Gauge,
  ScanLine,
  QrCode,
  Calendar,
  Wrench,
  Store,
  Users,
  Coins,
  TrendingUp,
  Settings,
  Gift,
  Trophy,
  Compass,
  Sparkles,
  Link2,
  type LucideIcon,
} from "lucide-react";

export const iconRegistry = {
  // customer tabs
  home: House,
  wallet: Ticket, // 券包 = tickets/coupons
  balance: Wallet, // 余额 = money wallet
  profile: CircleUser,
  discover: Compass,
  draw: Trophy,
  // business tabs
  overview: Gauge,
  redeem: ScanLine,
  scan: QrCode,
  campaigns: Calendar,
  hub: Wrench,
  stores: Store,
  store: Store,
  members: Users,
  coupons: TicketPercent,
  tokens: Coins,
  earnings: TrendingUp,
  settings: Settings,
  // reward / marketing
  gift: Gift,
  trophy: Trophy,
  prize: Sparkles,
  seller: Link2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

export function resolveIcon(name: IconName): LucideIcon {
  return iconRegistry[name];
}
