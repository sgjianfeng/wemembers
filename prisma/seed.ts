import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ─── Helpers ─── */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "wemembers-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/* ═══════════════════════════════════════════════════════════════
   DEMO SEED — Lucky Draw 为核心，代金券为辅助
   18商家 · 60顾客 · 3抽奖活动 · ~100张券 · ~500领取 · ~200核销
   模拟平台运营一个月后的活跃状态
   ═══════════════════════════════════════════════════════════════ */

async function main() {
  console.log("🎰 WeMembers Demo Seed\n");
  const PW = await hashPassword("demo1234");

  /* ================================================================
     CLEANUP
     ================================================================ */
  console.log("🧹 Cleaning old demo data...");
  const oldUsers = await prisma.user.findMany({ where: { email: { startsWith: "demo:" } }, select: { id: true, role: true } });
  const oldUserIds = oldUsers.map(u => u.id);
  const oldBizIds = oldUsers.filter(u => u.role === "business").map(u => u.id);

  if (oldUserIds.length > 0) {
    const oldCampaigns = await prisma.campaign.findMany({ where: { businessId: { in: oldBizIds } }, select: { id: true } });
    const oldCampaignIds = oldCampaigns.map(c => c.id);
    if (oldCampaignIds.length > 0) {
      await prisma.drawTicket.deleteMany({ where: { campaignId: { in: oldCampaignIds } } });
      await prisma.luckyDrawEntry.deleteMany({ where: { campaignId: { in: oldCampaignIds } } });
      await prisma.lotteryPrize.deleteMany({ where: { campaignId: { in: oldCampaignIds } } });
      await prisma.campaign.deleteMany({ where: { id: { in: oldCampaignIds } } });
    }
    const oldCoupons = await prisma.coupon.findMany({ where: { businessId: { in: oldBizIds } }, select: { id: true } });
    const oldCouponIds = oldCoupons.map(c => c.id);
    if (oldCouponIds.length > 0) {
      const oldClaims = await prisma.customerCoupon.findMany({ where: { couponId: { in: oldCouponIds } }, select: { id: true } });
      const oldClaimIds = oldClaims.map(c => c.id);
      if (oldClaimIds.length > 0) {
        await prisma.redemptionLog.deleteMany({ where: { customerCouponId: { in: oldClaimIds } } });
        await prisma.giftRecord.deleteMany({ where: { claimId: { in: oldClaimIds } } });
      }
      await prisma.customerCoupon.deleteMany({ where: { couponId: { in: oldCouponIds } } });
    }
    await prisma.coupon.deleteMany({ where: { businessId: { in: oldBizIds } } });
    const oldMemberships = await prisma.membership.findMany({ where: { businessId: { in: oldBizIds } }, select: { id: true } });
    if (oldMemberships.length > 0) {
      await prisma.pointsLog.deleteMany({ where: { membershipId: { in: oldMemberships.map(m => m.id) } } });
    }
    await prisma.membership.deleteMany({ where: { businessId: { in: oldBizIds } } });
    await prisma.store.deleteMany({ where: { businessId: { in: oldBizIds } } });
    await prisma.checkIn.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.tokenAccount.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.stripeAccount.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.userBadge.deleteMany({ where: { userId: { in: oldUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: oldUserIds } } });
  }
  console.log("✅ Clean\n");

  /* ================================================================
     BADGES
     ================================================================ */
  console.log("🏅 Badges...");
  const badgeDefs = [
    { key: "first_claim", name: "初次领券", description: "领取第一张代金券", icon: "🎫", category: "milestone", rarity: "common" },
    { key: "ten_claims", name: "券达人", description: "累计领取10张代金券", icon: "🏅", category: "milestone", rarity: "rare" },
    { key: "fifty_claims", name: "券王", description: "累计领取50张代金券", icon: "👑", category: "milestone", rarity: "epic" },
    { key: "first_redeem", name: "初次核销", description: "第一次到店使用代金券", icon: "✅", category: "milestone", rarity: "common" },
    { key: "ten_redeems", name: "核销能手", description: "累计核销10张券", icon: "💎", category: "milestone", rarity: "rare" },
    { key: "save_1000", name: "省钱达人", description: "累计节省 S$1,000", icon: "💰", category: "milestone", rarity: "epic" },
    { key: "streak_3", name: "连续签到", description: "连续签到3天", icon: "🔥", category: "streak", rarity: "common" },
    { key: "streak_7", name: "周常驻", description: "连续签到7天", icon: "🌟", category: "streak", rarity: "rare" },
    { key: "streak_30", name: "月度王者", description: "连续签到30天", icon: "🏆", category: "streak", rarity: "epic" },
    { key: "first_invite", name: "社交新手", description: "第一次邀请好友", icon: "👋", category: "social", rarity: "common" },
    { key: "invite_5", name: "社交达人", description: "成功邀请5位好友", icon: "🤝", category: "social", rarity: "rare" },
    { key: "first_gift", name: "慷慨大方", description: "第一次转赠代金券", icon: "🎁", category: "social", rarity: "common" },
  ];
  for (const b of badgeDefs) {
    await prisma.badge.upsert({ where: { key: b.key }, update: b, create: b });
  }

  /* ================================================================
     PLATFORM ADMIN
     ================================================================ */
  console.log("👑 Platform admin...");
  const platform = await prisma.user.create({
    data: {
      email: "demo:platform@wemembers.store",
      role: "admin",
      displayName: "WeMembers Platform",
      passwordHash: PW,
    },
  });

  /* ================================================================
     MERCHANTS — 18 businesses across 6 categories
     All based in VivoCity / NEX / Jurong Point / Tampines
     ================================================================ */
  console.log("🏪 Merchants (18)...");

  interface BizDef {
    email: string; name: string; category: string; slug: string;
    stores: { name: string; slug: string; address: string }[];
    tokenBalance: number;
    signupDaysAgo: number; // when they joined (spread across 4 weeks)
    activityLevel: "high" | "medium" | "low"; // how actively they use the platform
  }

  const bizDefs: BizDef[] = [
    // ── Cafes (5) ──
    { email: "demo:biz-brewbean@wm.local", name: "Brew & Bean", category: "food", slug: "brew-bean",
      stores: [
        { name: "Brew & Bean · VivoCity", slug: "brew-bean-vivo", address: "1 HarbourFront Walk #01-23, VivoCity" },
        { name: "Brew & Bean · NEX", slug: "brew-bean-nex", address: "23 Serangoon Central #02-15, NEX" },
      ], tokenBalance: 300, signupDaysAgo: 28, activityLevel: "high" },
    { email: "demo:biz-latteart@wm.local", name: "Latte Art SG", category: "food", slug: "latte-art-sg",
      stores: [
        { name: "Latte Art SG · Jurong Point", slug: "latte-art-jp", address: "1 Jurong West Central 2 #01-45, Jurong Point" },
      ], tokenBalance: 200, signupDaysAgo: 24, activityLevel: "medium" },
    { email: "demo:biz-morningrind@wm.local", name: "Morning Grind", category: "food", slug: "morning-grind",
      stores: [
        { name: "Morning Grind · Tampines Mall", slug: "morning-grind-tm", address: "4 Tampines Central 5 #B1-12, Tampines Mall" },
      ], tokenBalance: 150, signupDaysAgo: 18, activityLevel: "medium" },
    { email: "demo:biz-cafeswift@wm.local", name: "Café Swift", category: "food", slug: "cafe-swift",
      stores: [
        { name: "Café Swift · VivoCity", slug: "cafe-swift-vivo", address: "1 HarbourFront Walk #02-33, VivoCity" },
      ], tokenBalance: 100, signupDaysAgo: 10, activityLevel: "low" },
    { email: "demo:biz-theroast@wm.local", name: "The Roast House", category: "food", slug: "the-roast-house",
      stores: [
        { name: "The Roast House · NEX", slug: "roast-house-nex", address: "23 Serangoon Central #01-08, NEX" },
      ], tokenBalance: 200, signupDaysAgo: 6, activityLevel: "high" },

    // ── Restaurants (4) ──
    { email: "demo:biz-spicerice@wm.local", name: "Spice & Rice", category: "food", slug: "spice-rice",
      stores: [
        { name: "Spice & Rice · VivoCity", slug: "spice-rice-vivo", address: "1 HarbourFront Walk #B2-18, VivoCity" },
        { name: "Spice & Rice · Jurong Point", slug: "spice-rice-jp", address: "1 Jurong West Central 2 #03-22, Jurong Point" },
      ], tokenBalance: 350, signupDaysAgo: 26, activityLevel: "high" },
    { email: "demo:biz-wokhei@wm.local", name: "Wok Hei Kitchen", category: "food", slug: "wok-hei-kitchen",
      stores: [
        { name: "Wok Hei Kitchen · NEX", slug: "wok-hei-nex", address: "23 Serangoon Central #B1-35, NEX" },
      ], tokenBalance: 200, signupDaysAgo: 20, activityLevel: "medium" },
    { email: "demo:biz-sushispot@wm.local", name: "Sushi Spot", category: "food", slug: "sushi-spot",
      stores: [
        { name: "Sushi Spot · Tampines Mall", slug: "sushi-spot-tm", address: "4 Tampines Central 5 #03-08, Tampines Mall" },
      ], tokenBalance: 250, signupDaysAgo: 14, activityLevel: "medium" },
    { email: "demo:biz-noodlehse@wm.local", name: "Noodle House SG", category: "food", slug: "noodle-house-sg",
      stores: [
        { name: "Noodle House · Jurong Point", slug: "noodle-hse-jp", address: "1 Jurong West Central 2 #B1-50, Jurong Point" },
      ], tokenBalance: 100, signupDaysAgo: 8, activityLevel: "low" },

    // ── Bubble Tea (3) ──
    { email: "demo:biz-bubblebliss@wm.local", name: "Bubble Bliss", category: "food", slug: "bubble-bliss",
      stores: [
        { name: "Bubble Bliss · VivoCity", slug: "bubble-bliss-vivo", address: "1 HarbourFront Walk #B2-05, VivoCity" },
        { name: "Bubble Bliss · Tampines Mall", slug: "bubble-bliss-tm", address: "4 Tampines Central 5 #B1-22, Tampines Mall" },
        { name: "Bubble Bliss · NEX", slug: "bubble-bliss-nex", address: "23 Serangoon Central #B2-08, NEX" },
      ], tokenBalance: 400, signupDaysAgo: 25, activityLevel: "high" },
    { email: "demo:biz-teafusion@wm.local", name: "TeaFusion", category: "food", slug: "tea-fusion",
      stores: [
        { name: "TeaFusion · Jurong Point", slug: "tea-fusion-jp", address: "1 Jurong West Central 2 #01-30, Jurong Point" },
      ], tokenBalance: 150, signupDaysAgo: 16, activityLevel: "medium" },
    { email: "demo:biz-pearldyn@wm.local", name: "Pearl Dynasty", category: "food", slug: "pearl-dynasty",
      stores: [
        { name: "Pearl Dynasty · VivoCity", slug: "pearl-dyn-vivo", address: "1 HarbourFront Walk #01-55, VivoCity" },
      ], tokenBalance: 100, signupDaysAgo: 5, activityLevel: "low" },

    // ── Bakeries (2) ──
    { email: "demo:biz-buttercrust@wm.local", name: "Butter & Crust", category: "food", slug: "butter-crust",
      stores: [
        { name: "Butter & Crust · NEX", slug: "butter-crust-nex", address: "23 Serangoon Central #B1-18, NEX" },
      ], tokenBalance: 200, signupDaysAgo: 22, activityLevel: "high" },
    { email: "demo:biz-sweetdough@wm.local", name: "Sweet Dough Bakery", category: "food", slug: "sweet-dough",
      stores: [
        { name: "Sweet Dough · Tampines Mall", slug: "sweet-dough-tm", address: "4 Tampines Central 5 #01-35, Tampines Mall" },
      ], tokenBalance: 150, signupDaysAgo: 12, activityLevel: "medium" },

    // ── Beauty / Wellness (2) ──
    { email: "demo:biz-glowup@wm.local", name: "Glow Up Studio", category: "beauty", slug: "glow-up-studio",
      stores: [
        { name: "Glow Up · VivoCity", slug: "glow-up-vivo", address: "1 HarbourFront Walk #03-12, VivoCity" },
      ], tokenBalance: 200, signupDaysAgo: 15, activityLevel: "medium" },
    { email: "demo:biz-nailart@wm.local", name: "Nail Artistry SG", category: "beauty", slug: "nail-artistry",
      stores: [
        { name: "Nail Artistry · NEX", slug: "nail-art-nex", address: "23 Serangoon Central #03-28, NEX" },
      ], tokenBalance: 100, signupDaysAgo: 7, activityLevel: "low" },

    // ── Retail (2) ──
    { email: "demo:biz-gadgetnook@wm.local", name: "Gadget Nook", category: "retail", slug: "gadget-nook",
      stores: [
        { name: "Gadget Nook · Jurong Point", slug: "gadget-nook-jp", address: "1 Jurong West Central 2 #02-40, Jurong Point" },
      ], tokenBalance: 150, signupDaysAgo: 19, activityLevel: "medium" },
    { email: "demo:biz-bookhaven@wm.local", name: "Book Haven", category: "retail", slug: "book-haven",
      stores: [
        { name: "Book Haven · Tampines Mall", slug: "book-haven-tm", address: "4 Tampines Central 5 #04-15, Tampines Mall" },
      ], tokenBalance: 100, signupDaysAgo: 9, activityLevel: "low" },
  ];

  const merchants: Record<string, any> = {};
  const allStores: any[] = [];

  for (const def of bizDefs) {
    const biz = await prisma.user.create({
      data: {
        email: def.email,
        role: "business",
        displayName: def.name,
        businessName: def.name,
        businessCategory: def.category,
        businessSlug: def.slug,
        passwordHash: PW,
        createdAt: daysAgo(def.signupDaysAgo),
        tokenAccount: {
          create: { balance: def.tokenBalance, totalEarned: def.tokenBalance },
        },
      },
    });
    merchants[def.name] = { ...biz, _activity: def.activityLevel, _signupDays: def.signupDaysAgo };

    // Create stores
    for (const s of def.stores) {
      const store = await prisma.store.create({
        data: {
          businessId: biz.id,
          name: s.name,
          slug: s.slug,
          address: s.address,
        },
      });
      allStores.push(store);
      if (!merchants[def.name]._stores) merchants[def.name]._stores = [];
      merchants[def.name]._stores.push(store);
    }
  }
  console.log(`  ✅ ${bizDefs.length} merchants, ${allStores.length} stores`);

  /* ================================================================
     CUSTOMERS — 60 people, realistic name mix
     ================================================================ */
  console.log("👥 Customers (60)...");

  const customerNames = [
    // Power users (high engagement) — 15
    ["demo:alicia@cust.sg", "Alicia Tan", 5200, 18500, "platinum", 28],
    ["demo:benny@cust.sg", "Benny Lim", 3800, 12000, "gold", 22],
    ["demo:cheryl@cust.sg", "Cheryl Wong", 4500, 15500, "gold", 18],
    ["demo:darren@cust.sg", "Darren Lee", 6200, 22000, "platinum", 30],
    ["demo:elaine@cust.sg", "Elaine Ng", 3100, 9800, "gold", 15],
    ["demo:farhan@cust.sg", "Farhan Malik", 2800, 8500, "gold", 14],
    ["demo:grace@cust.sg", "Grace Chen", 7800, 28000, "platinum", 30],
    ["demo:haris@cust.sg", "Haris Abdullah", 2500, 7200, "silver", 10],
    ["demo:iris@cust.sg", "Iris Koh", 4200, 14000, "gold", 20],
    ["demo:jason@cust.sg", "Jason Teo", 5500, 19500, "platinum", 25],
    ["demo:kelly@cust.sg", "Kelly Chua", 3600, 11000, "gold", 16],
    ["demo:liwen@cust.sg", "Li Wen Zhang", 4800, 16000, "gold", 19],
    ["demo:meiqi@cust.sg", "Mei Qi Lin", 3200, 9500, "gold", 12],
    ["demo:nick@cust.sg", "Nick Goh", 2900, 8800, "silver", 11],
    ["demo:olivia@cust.sg", "Olivia Png", 5100, 17800, "platinum", 24],
    // Regular users — 20
    ["demo:pat@cust.sg", "Pat Yeo", 1200, 3500, "silver", 7],
    ["demo:qinyi@cust.sg", "Qin Yi Ho", 980, 2800, "silver", 6],
    ["demo:ray@cust.sg", "Raymond Foo", 1500, 4500, "silver", 9],
    ["demo:sarah@cust.sg", "Sarah Liew", 850, 2200, "silver", 5],
    ["demo:tom@cust.sg", "Tommy Heng", 680, 1800, "silver", 4],
    ["demo:uma@cust.sg", "Uma Devi", 1100, 3200, "silver", 8],
    ["demo:vik@cust.sg", "Vikram Raj", 720, 1900, "regular", 3],
    ["demo:wendy@cust.sg", "Wendy Lau", 1400, 4000, "silver", 7],
    ["demo:xinyi@cust.sg", "Xin Yi Tay", 550, 1500, "regular", 3],
    ["demo:yusof@cust.sg", "Yusof Rahim", 920, 2600, "silver", 5],
    ["demo:zara@cust.sg", "Zara Tan", 650, 1700, "regular", 2],
    ["demo:adrian@cust.sg", "Adrian Sim", 1050, 3100, "silver", 6],
    ["demo:bella@cust.sg", "Bella Chong", 480, 1200, "regular", 3],
    ["demo:calvin@cust.sg", "Calvin Wee", 880, 2500, "silver", 5],
    ["demo:diana@cust.sg", "Diana Lim", 760, 2000, "regular", 4],
    ["demo:edwin@cust.sg", "Edwin Neo", 1300, 3800, "silver", 8],
    ["demo:fiona@cust.sg", "Fiona Ang", 580, 1400, "regular", 2],
    ["demo:gary@cust.sg", "Gary Soh", 980, 2900, "silver", 5],
    ["demo:hannah@cust.sg", "Hannah Yeoh", 1100, 3300, "silver", 6],
    ["demo:ian@cust.sg", "Ian Seet", 820, 2300, "silver", 4],
    // Light users — 15
    ["demo:jane@cust.sg", "Jane Poh", 250, 600, "regular", 1],
    ["demo:kent@cust.sg", "Kent Choo", 180, 400, "regular", 0],
    ["demo:lina@cust.sg", "Lina Yap", 320, 750, "regular", 2],
    ["demo:marcus@cust.sg", "Marcus Ong", 120, 250, "regular", 0],
    ["demo:nora@cust.sg", "Nora Shah", 200, 500, "regular", 1],
    ["demo:oscar@cust.sg", "Oscar Tang", 90, 150, "regular", 0],
    ["demo:priya@cust.sg", "Priya Nair", 280, 650, "regular", 1],
    ["demo:quin@cust.sg", "Quin Gan", 150, 350, "regular", 0],
    ["demo:rita@cust.sg", "Rita Toh", 300, 700, "regular", 2],
    ["demo:sam@cust.sg", "Sam Leong", 100, 200, "regular", 0],
    ["demo:tina@cust.sg", "Tina Kwan", 220, 500, "regular", 1],
    ["demo:umar@cust.sg", "Umar Said", 160, 380, "regular", 0],
    ["demo:vivian@cust.sg", "Vivian Lee", 260, 600, "regular", 1],
    ["demo:will@cust.sg", "Will Chew", 80, 150, "regular", 0],
    ["demo:xiuling@cust.sg", "Xiu Ling Chan", 190, 450, "regular", 1],
    // New/inactive — 10
    ["demo:adam@cust.sg", "Adam Tee", 50, 50, "regular", 0],
    ["demo:brenda@cust.sg", "Brenda Quek", 30, 30, "regular", 0],
    ["demo:charlie@cust.sg", "Charlie Peh", 0, 0, "regular", 0],
    ["demo:debbie@cust.sg", "Debbie Kam", 20, 20, "regular", 0],
    ["demo:eric@cust.sg", "Eric Pang", 0, 0, "regular", 0],
    ["demo:fanny@cust.sg", "Fanny Low", 40, 40, "regular", 0],
    ["demo:george@cust.sg", "George Han", 10, 10, "regular", 0],
    ["demo:helen@cust.sg", "Helen Chia", 0, 0, "regular", 0],
    ["demo:ivan@cust.sg", "Ivan Teng", 60, 60, "regular", 1],
    ["demo:joyce@cust.sg", "Joyce Lam", 0, 0, "regular", 0],
  ];

  const customers: Record<string, any> = {};
  for (const [email, name, points, lifetime, tier, streak] of customerNames) {
    const joinDays = rand(2, 30); // spread signup across the month
    const cust = await prisma.user.create({
      data: {
        email: email as string,
        role: "customer",
        displayName: name as string,
        pointsBalance: points as number,
        lifetimePoints: lifetime as number,
        membershipTier: tier as string,
        streakDays: streak as number,
        lastCheckIn: streak ? hoursAgo(rand(1, 24)) : null,
        passwordHash: PW,
        createdAt: daysAgo(joinDays),
      },
    });
    customers[name as string] = cust;
  }
  console.log(`  ✅ ${customerNames.length} customers`);

  /* ================================================================
     COUPONS — ~100 across merchants, varied by activity level
     ================================================================ */
  console.log("🎫 Coupons...");

  const couponTemplates = {
    high: [
      // High activity merchants: 5-7 coupons, variety
      { title: "$10 任意消费券", type: "fixed_amount", v: 1000, min: 0, pts: 120, qty: null, remain: null, gift: "points", giftData: '{"points":20}' },
      { title: "招牌饮品 70% OFF", type: "percentage", v: 7000, min: 500, pts: 250, qty: 80, remain: 23, gift: "none", giftData: '{}' },
      { title: "免费小食兑换券", type: "free_item", v: 500, min: 0, pts: 100, qty: 50, remain: 5, gift: "lottery", giftData: '{"prizes":[{"name":"再来一份","icon":"🍟","weight":5}]}' },
      { title: "$5 满减券", type: "fixed_amount", v: 500, min: 1000, pts: 60, qty: null, remain: null, gift: "none", giftData: '{}' },
      { title: "套餐 6 折优惠", type: "percentage", v: 6000, min: 2000, pts: 300, qty: 30, remain: 18, gift: "points", giftData: '{"points":50}' },
    ],
    medium: [
      { title: "$8 折扣券", type: "fixed_amount", v: 800, min: 500, pts: 100, qty: 60, remain: 35, gift: "none", giftData: '{}' },
      { title: "50% OFF 任意单品", type: "percentage", v: 5000, min: 800, pts: 200, qty: 40, remain: 22, gift: "none", giftData: '{}' },
      { title: "买一送一", type: "free_item", v: 800, min: 800, pts: 150, qty: 30, remain: 12, gift: "points", giftData: '{"points":30}' },
    ],
    low: [
      { title: "$5 尝鲜券", type: "fixed_amount", v: 500, min: 0, pts: 80, qty: 40, remain: 28, gift: "none", giftData: '{}' },
      { title: "30% OFF", type: "percentage", v: 3000, min: 500, pts: 150, qty: 30, remain: 20, gift: "none", giftData: '{}' },
    ],
  };

  const allCoupons: any[] = [];
  for (const [bizName, biz] of Object.entries(merchants)) {
    const level = biz._activity as "high" | "medium" | "low";
    const templates = [...(couponTemplates[level] || couponTemplates.low)];
    const count = level === "high" ? rand(5, 7) : level === "medium" ? rand(3, 5) : rand(1, 3);

    for (let i = 0; i < count; i++) {
      const t = templates[i % templates.length];
      const publishDaysAgo = rand(2, Math.max(3, biz._signupDays - 2));
      const validDays = rand(10, 40);
      const claimed = level === "high" ? rand(20, 120) : level === "medium" ? rand(8, 40) : rand(0, 15);
      const remaining = t.remain !== null && t.remain <= 5 ? t.remain : (t.qty !== null ? Math.max(0, (t.qty as number) - claimed) : null);

      const c = await prisma.coupon.create({
        data: {
          businessId: biz.id,
          title: `[${bizName}] ${t.title}`,
          type: t.type,
          valueCents: t.v,
          minSpendCents: t.min,
          pointsRequired: t.pts,
          totalQuantity: t.qty,
          remainingQuantity: remaining,
          validFrom: daysAgo(publishDaysAgo),
          validUntil: daysFromNow(validDays),
          status: "published",
          claimedCount: claimed,
          giftType: t.gift,
          giftData: t.giftData,
          createdAt: daysAgo(publishDaysAgo),
        },
      });
      allCoupons.push(c);
    }
  }
  console.log(`  ✅ ${allCoupons.length} coupons published`);

  /* ================================================================
     LUCKY DRAW CAMPAIGNS (5) — platform-powered, sorted by popularity
     ================================================================ */
  console.log("🎰 Lucky Draws (5)...");

  // Draw data: [name, slug, daysLeft, entries, tickets, poolCents, prizelist, color, bizKey]
  type DrawDef = [string, string, number, number, number, number, [string, string, string, number, number, number][], string, string];
  const drawDefs: DrawDef[] = [
    // 1) FLAGSHIP — most popular, biggest prizes
    ["🏖️ Summer Shopping Festival", "summer-festival", 15, 130, 850, 6880000, [
      ["BYD Sealion 7", "🚗", "item", 1, 1, 1],
      ["iPhone 17 Pro 256GB", "📱", "item", 3, 2, 2],
      ["S$500 现金大奖", "💵", "cash", 8, 5, 4, 50000],
      ["S$100 代金券礼包", "🎫", "coupon", 20, 20, 15, 10000],
      ["S$20 即时现金", "💰", "cash", 40, 50, 38, 2000],
      ["免费饮品兑换券", "🧋", "item", 60, 200, 152],
    ], "#FF6B35", "Brew & Bean"],
    // 2) URGENCY — ending soon, high participation
    ["🍜 Foodie Feast Draw", "foodie-feast", 5, 55, 280, 450000, [
      ["S$300 美食代金券", "🍽️", "coupon", 5, 3, 2, 30000],
      ["S$50 现金", "💵", "cash", 15, 10, 7, 5000],
      ["免费套餐券", "🎫", "item", 30, 30, 21],
      ["S$10 饮品券", "☕", "coupon", 40, 50, 35, 1000],
    ], "#E53E3E", "Spice & Rice"],
    // 3) PREMIUM — VIP exclusive, medium popularity
    ["👑 VIP Exclusive Draw", "vip-exclusive", 20, 65, 350, 2800000, [
      ["S$800 购物券", "🛍️", "coupon", 3, 3, 1, 80000],
      ["Dyson 吸尘器", "🧹", "item", 5, 2, 1],
      ["S$100 现金", "💵", "cash", 15, 10, 6, 10000],
      ["S$30 代金券", "🎫", "coupon", 30, 30, 18, 3000],
    ], "#8B5CF6", "Bubble Bliss"],
    // 4) NEW — low popularity, just started
    ["🆕 Newcomer Lucky Spin", "newcomer-spin", 25, 25, 120, 180000, [
      ["S$50 现金", "💵", "cash", 10, 5, 4, 5000],
      ["S$10 代金券", "🎫", "coupon", 30, 20, 15, 1000],
      ["免费饮品", "🧋", "item", 50, 50, 38],
    ], "#10B981", "Butter & Crust"],
    // 5) ENDED — social proof
    ["🎉 Grand Opening Draw", "grand-opening", -5, 85, 420, 3200000, [
      ["S$200 现金", "💵", "cash", 5, 3, 0, 20000],
      ["S$50 代金券", "🎫", "coupon", 15, 10, 0, 5000],
      ["免费饮品", "🧋", "item", 30, 50, 5],
    ], "#805AD5", "Bubble Bliss"],
  ];

  const allDraws: any[] = [];
  for (const [name, slug, daysLeft, entries, tickets, pool, prizes, color, bizKey] of drawDefs) {
    const isEnded = daysLeft < 0;
    const campaign = await prisma.campaign.create({
      data: {
        businessId: merchants[bizKey].id,
        name,
        description: isEnded ? "感谢参与！奖品已全部发放。" : `在合作门店消费即可参与。${entries}人已参与，${tickets}张抽奖券已发出！`,
        type: "lucky_draw",
        color,
        startDate: daysAgo(isEnded ? 35 : Math.abs(daysLeft) + rand(5, 15)),
        endDate: isEnded ? daysAgo(Math.abs(daysLeft)) : daysFromNow(daysLeft),
        drawDate: isEnded ? daysAgo(Math.abs(daysLeft)) : daysFromNow(daysLeft),
        minSpendCents: 500,
        entryMethod: "receipt",
        receiptMinSpend: 500,
        ticketsPerUnit: 1,
        status: isEnded ? "ended" : "active",
        slug,
        allowCollaboration: true,
        joinable: !isEnded,
        entryCount: entries,
        totalTicketCount: tickets,
        budgetPercent: 20,
        instantPoolCents: pool,
        storeIds: JSON.stringify(allStores.map(s => s.id)),
      },
    });
    allDraws.push(campaign);

    await prisma.lotteryPrize.createMany({
      data: prizes.map(([pName, icon, type, weight, total, remain, valueCents]) => ({
        campaignId: campaign.id,
        name: pName,
        icon,
        type,
        weight,
        totalStock: total,
        remainingStock: remain,
        ...(valueCents ? { valueCents } : {}),
        ...(isEnded && remain === 0 ? { claimed: total } : {}),
      })),
    });
  }

  console.log(`  ✅ ${allDraws.length} campaigns (${drawDefs.filter(d => d[2] > 0).length} active · ${drawDefs.filter(d => d[2] < 0).length} ended)`);

  /* ================================================================
     CUSTOMER PARTICIPATION — draw entries + tickets
     ================================================================ */
  console.log("🎟️  Draw participation...");

  const activeCustomers = Object.values(customers).filter((c: any) => c.membershipTier !== "regular" || c.pointsBalance > 200);
  const allCustomerList = Object.values(customers);
  let ticketCounter = 0;

  // Data-driven: each draw gets proportional participation
  // [drawIndex, participationLevel, customerSlice, entryChance, amountRange]
  const drawParticipation: [number, string, number, number, [number, number]][] = [
    [0, "high", 42, 0.8, [1000, 8000]],    // Flagship — most popular
    [1, "high", 28, 0.5, [500, 5000]],     // Foodie — ending soon
    [2, "medium", 20, 0.4, [500, 4000]],   // VIP
    [3, "low", 12, 0.3, [500, 3000]],      // Newcomer — just started
    [4, "ended", 30, 0.5, [500, 4000]],    // Ended — historical
  ];

  for (const [drawIdx, level, slice, chance, [minAmt, maxAmt]] of drawParticipation) {
    const draw = allDraws[drawIdx];
    const isEnded = draw.status === "ended";
    const prefix = draw.slug.slice(0, 2).toUpperCase();

    for (const cust of activeCustomers.slice(0, slice)) {
      if (Math.random() > chance) continue;
      const entriesPerCust = level === "high" ? rand(1, 5) : level === "medium" ? rand(1, 3) : rand(1, 2);
      for (let e = 0; e < entriesPerCust; e++) {
        const amount = rand(minAmt, maxAmt);
        const ticketCount = Math.max(1, Math.floor(amount / (isEnded ? 500 : 1000)));
        const entry = await prisma.luckyDrawEntry.create({
          data: {
            campaignId: draw.id,
            customerId: (cust as any).id,
            storeId: pick(allStores).id,
            source: "receipt",
            receiptAmount: amount,
            ticketCount,
            won: isEnded ? Math.random() > 0.85 : false,
            prizeName: isEnded && Math.random() > 0.85 ? pick(["S$50 代金券", "免费饮品", "S$10 饮品券"]) : null,
            prizeIcon: isEnded && Math.random() > 0.85 ? pick(["🎫", "🧋", "☕"]) : null,
            createdAt: isEnded ? daysAgo(rand(10, 35)) : undefined,
          },
        });
        for (let t = 0; t < ticketCount; t++) {
          await prisma.drawTicket.create({
            data: {
              campaignId: draw.id,
              customerId: (cust as any).id,
              entryId: entry.id,
              ticketNo: `${prefix}-${String(++ticketCounter).padStart(6, "0")}`,
              drawMode: isEnded ? "deferred" : (Math.random() > 0.3 ? "deferred" : "instant"),
              won: isEnded ? Math.random() > 0.9 : false,
              prizeName: isEnded && Math.random() > 0.9 ? "免费饮品" : null,
              prizeIcon: isEnded && Math.random() > 0.9 ? "🧋" : null,
            },
          });
        }
      }
    }
  }
  console.log("  ✅ Draw entries populated");

  /* ================================================================
     COUPON CLAIMS + REDEMPTIONS
     ================================================================ */
  console.log("💳 Claims & redemptions...");

  let totalClaims = 0;
  let totalRedemptions = 0;

  for (const cust of allCustomerList) {
    const tier = (cust as any).membershipTier;
    const claimCount = tier === "platinum" ? rand(8, 15)
      : tier === "gold" ? rand(4, 10)
      : tier === "silver" ? rand(2, 6)
      : (cust as any).pointsBalance > 50 ? rand(1, 3)
      : 0;

    for (let i = 0; i < claimCount; i++) {
      const coupon = pick(allCoupons);
      const willRedeem = Math.random() < (tier === "platinum" ? 0.6 : tier === "gold" ? 0.4 : 0.2);
      const claimedDays = rand(willRedeem ? 3 : 1, 25);
      const qrCode = `GWM-${String(rand(100000, 999999))}`;

      const claim = await prisma.customerCoupon.create({
        data: {
          customerId: (cust as any).id,
          couponId: coupon.id,
          status: willRedeem ? "used" : "available",
          qrCode,
          claimedAt: daysAgo(claimedDays),
          pointsSpent: coupon.pointsRequired,
          ...(willRedeem ? { usedAt: daysAgo(rand(1, claimedDays - 1)) } : {}),
        },
      });
      totalClaims++;

      if (willRedeem) {
        const savedAmount = coupon.type === "free_item" ? coupon.valueCents / 100
          : coupon.type === "percentage" ? (coupon.minSpendCents * (coupon.valueCents / 10000)) / 100
          : coupon.valueCents / 100;
        await prisma.redemptionLog.create({
          data: {
            businessId: coupon.businessId,
            customerId: (cust as any).id,
            couponId: coupon.id,
            customerCouponId: claim.id,
            amountSaved: Math.round(savedAmount * 100) / 100,
            storeId: pick(allStores).id,
            redeemedAt: daysAgo(rand(1, claimedDays - 1)),
          },
        });
        totalRedemptions++;
      }
    }
  }
  console.log(`  ✅ ${totalClaims} claims · ${totalRedemptions} redemptions`);

  /* ================================================================
     CHECK-INS — streaks for active users
     ================================================================ */
  console.log("📅 Check-ins...");

  const bonusMap: Record<number, number> = { 1: 5, 2: 5, 3: 8, 4: 8, 5: 10, 6: 10, 7: 15, 8: 15, 9: 20, 10: 20 };

  for (const cust of allCustomerList) {
    const streak = (cust as any).streakDays || 0;
    if (streak === 0) continue;
    for (let d = 0; d < streak; d++) {
      const date = daysAgo(streak - d - 1);
      await prisma.checkIn.upsert({
        where: { userId_date: { userId: (cust as any).id, date: date.toISOString().slice(0, 10) } },
        update: {},
        create: {
          userId: (cust as any).id,
          date: date.toISOString().slice(0, 10),
          dayNumber: d + 1,
          bonus: bonusMap[((d) % 10) + 1] || 10,
        },
      });
    }
  }
  console.log("  ✅ Check-in history created");

  /* ================================================================
     MEMBERSHIPS
     ================================================================ */
  console.log("🤝 Memberships...");

  const bizKeys = Object.keys(merchants);
  for (const cust of allCustomerList) {
    const tier = (cust as any).membershipTier;
    // Active users join more businesses
    const bizCount = tier === "platinum" ? rand(5, 10) : tier === "gold" ? rand(3, 7) : tier === "silver" ? rand(2, 5) : (cust as any).pointsBalance > 50 ? rand(1, 3) : 0;
    const shuffled = [...bizKeys].sort(() => Math.random() - 0.5).slice(0, bizCount);

    for (const bizName of shuffled) {
      const biz = merchants[bizName];
      await prisma.membership.upsert({
        where: { businessId_customerId: { businessId: biz.id, customerId: (cust as any).id } },
        update: {},
        create: {
          businessId: biz.id,
          customerId: (cust as any).id,
          points: Math.floor((cust as any).lifetimePoints * Math.random() * 0.3),
          visitsCount: rand(1, 15),
          totalSpent: Math.floor((cust as any).lifetimePoints * Math.random() * 0.15),
          tier: tier === "platinum" ? pick(["gold", "platinum"]) : tier === "gold" ? pick(["silver", "gold"]) : tier,
        },
      });
    }
  }
  console.log("  ✅ Memberships created");

  /* ================================================================
     SUMMARY
     ================================================================ */
  console.log("\n" + "═".repeat(60));
  console.log("  🎰 WeMembers Demo — 平台运营一个月后的活跃状态");
  console.log("═".repeat(60));
  console.log("");
  console.log("  👑 Platform:   demo:platform@wemembers.store");
  console.log("  🏪 Merchants:  18家 (☕5咖啡 🍜4餐厅 🧋3奶茶 🍰2烘焙 💇2美业 🛒2零售)");
  console.log("  🏬 Stores:     " + String(allStores.length) + "间 (VivoCity · NEX · Jurong Point · Tampines)");
  console.log("  👥 Customers:  60人 (👑铂金5 🥇金10 🥈银14 🆕普通21 🚫未激活10)");
  console.log("  🎫 Coupons:    " + String(allCoupons.length) + "张 (高折扣/免单/满减/限量)");
  console.log("  🎰 Draws:      5个 (🏖️旗舰15天 🔥美食5天 👑VIP20天 🆕新手25天 🎉已结束)");
  console.log("  🎟️ Claims:     " + String(totalClaims) + "次领取 · " + String(totalRedemptions) + "次核销");
  console.log("");
  console.log("  🔑 所有密码: demo1234");
  console.log("  📧 邮箱格式: demo:{role}@wm.local / demo:{name}@cust.sg");
  console.log("═".repeat(60) + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
