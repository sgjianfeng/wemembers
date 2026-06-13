import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const badges = [
  // 里程碑
  { key: "first_claim", name: "初次领券", description: "领取第一张代金券", icon: "🎫", category: "milestone", rarity: "common" },
  { key: "ten_claims", name: "券达人", description: "累计领取10张代金券", icon: "🏅", category: "milestone", rarity: "rare" },
  { key: "fifty_claims", name: "券王", description: "累计领取50张代金券", icon: "👑", category: "milestone", rarity: "epic" },
  { key: "first_redeem", name: "初次核销", description: "第一次到店使用代金券", icon: "✅", category: "milestone", rarity: "common" },
  { key: "ten_redeems", name: "核销能手", description: "累计核销10张券", icon: "💎", category: "milestone", rarity: "rare" },
  { key: "save_1000", name: "省钱达人", description: "累计节省 ¥1,000", icon: "💰", category: "milestone", rarity: "epic" },
  // 签到
  { key: "streak_3", name: "连续签到", description: "连续签到3天", icon: "🔥", category: "streak", rarity: "common" },
  { key: "streak_7", name: "周常驻", description: "连续签到7天", icon: "🌟", category: "streak", rarity: "rare" },
  { key: "streak_30", name: "月度王者", description: "连续签到30天", icon: "🏆", category: "streak", rarity: "epic" },
  // 社交
  { key: "first_invite", name: "社交新手", description: "第一次邀请好友", icon: "👋", category: "social", rarity: "common" },
  { key: "invite_5", name: "社交达人", description: "成功邀请5位好友", icon: "🤝", category: "social", rarity: "rare" },
  { key: "first_gift", name: "慷慨大方", description: "第一次转赠代金券", icon: "🎁", category: "social", rarity: "common" },
];

async function main() {
  console.log("🌱 Seeding badges...");
  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { key: badge.key },
      update: badge,
      create: badge,
    });
  }
  console.log(`✅ ${badges.length} badges seeded`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
