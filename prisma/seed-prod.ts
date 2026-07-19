/**
 * Production seed — minimal data so a first visitor can walk through the full V2 flow.
 *
 * What it creates:
 *   1 demo business + store
 *   3 lucky_draw_v2 campaigns (one for each major voucher tier, with real slugs)
 *   1 platform admin account
 *
 * Run on the server:
 *   npx prisma db seed
 * or directly:
 *   npx tsx prisma/seed-prod.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "wemembers-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const now = new Date();
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

async function main() {
  console.log("🚀 WeMembers — Production Seed\n");
  const PW = await hashPassword(process.env.SEED_ADMIN_PASSWORD || "admin123456");

  /* ── Platform Admin ─────────────────────────────────────────── */
  console.log("👑 Platform admin...");
  const adminEmail = process.env.PLATFORM_ACCOUNT_EMAIL || "wemembers.platform@wemembers.store";

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  let admin = existingAdmin;
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        role: "admin",
        displayName: "WeMembers Platform",
        passwordHash: PW,
      },
    });
    console.log(`  ✅ Created admin: ${adminEmail}`);
  } else {
    console.log(`  ⏭️  Admin already exists: ${adminEmail}`);
  }

  /* ── Demo Business ──────────────────────────────────────────── */
  console.log("🏪 Demo business...");
  const bizEmail = "demo@wemembers.store";

  let biz = await prisma.user.findUnique({ where: { email: bizEmail } });
  if (!biz) {
    biz = await prisma.user.create({
      data: {
        email: bizEmail,
        role: "business",
        displayName: "WeM Demo Café",
        businessName: "WeM Demo Café",
        businessCategory: "food",
        businessSlug: "wem-demo-cafe",
        passwordHash: PW,
        tokenAccount: { create: { balance: 0, frozenBalance: 0, totalEarned: 0, totalSpent: 0 } },
      },
    });
    console.log(`  ✅ Created business: ${bizEmail}`);
  } else {
    console.log(`  ⏭️  Business already exists: ${bizEmail}`);
  }

  /* ── Demo Store ─────────────────────────────────────────────── */
  console.log("🏬 Demo store...");
  const storeSlug = "wem-demo-vivo";

  let store = await prisma.store.findUnique({ where: { slug: storeSlug } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        businessId: biz.id,
        name: "WeM Demo Café · VivoCity",
        slug: storeSlug,
        address: "1 HarbourFront Walk #01-23, VivoCity, Singapore",
      },
    });
    console.log(`  ✅ Created store: ${store.name}`);
  } else {
    console.log(`  ⏭️  Store already exists: ${storeSlug}`);
  }

  /* ── V2 Lucky Draw Campaigns ─────────────────────────────────── */
  console.log("🎰 V2 voucher-draw campaigns...");

  const campaignDefs = [
    {
      name: "🎰 WeM Lucky Draw — VivoCity",
      slug: "wem-lucky",
      description: "Buy a voucher, win an instant prize, and enter the grand pool for iPad, iPhone & BYD!",
    },
    {
      name: "🎰 WeM Lucky Draw — NEX",
      slug: "wem-nex",
      description: "Another V2 draw network hub — same grand pool, more stores!",
    },
    {
      name: "🎰 WeM Lucky Draw — Tampines",
      slug: "wem-tampines",
      description: "Tampines hub — join the spending network and enter the grand draw!",
    },
  ];

  const createdCampaigns: any[] = [];

  for (const def of campaignDefs) {
    const existing = await prisma.campaign.findUnique({ where: { slug: def.slug } });
    if (existing) {
      console.log(`  ⏭️  Campaign already exists: ${def.slug}`);
      createdCampaigns.push(existing);
      continue;
    }

    const campaign = await prisma.campaign.create({
      data: {
        businessId: biz.id,
        name: def.name,
        description: def.description,
        type: "lucky_draw_v2",
        status: "active",
        startDate: now,
        endDate: daysFromNow(90),
        drawDate: daysFromNow(90),
        budgetPercent: 20,
        instantPoolRatio: 20,
        midPoolRatio: 0,
        grandPoolRatio: 80,
        entryMethod: "receipt",
        receiptMinSpend: 0,
        slug: def.slug,
        allowCollaboration: true,
        joinable: true,
        storeIds: JSON.stringify([store!.id]),
        voucherTiers: JSON.stringify([
          { min: 50, max: 50, tier: "small", instantPrizeCap: 8 },
          { min: 100, max: 100, tier: "medium", instantPrizeCap: 20 },
          { min: 200, max: 200, tier: "large", instantPrizeCap: 40 },
        ]),
      },
    });
    createdCampaigns.push(campaign);
    console.log(`  ✅ Created campaign: ${def.slug}`);
  }

  /* ── Summary ─────────────────────────────────────────────────── */
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Production seed complete!");
  console.log("═".repeat(60));
  console.log("");
  console.log("  🔑 Admin login:   " + adminEmail);
  console.log("  🔑 Business login: demo@wemembers.store");
  console.log("  🔑 Password:       " + (process.env.SEED_ADMIN_PASSWORD || "admin123456"));
  console.log("");
  console.log("  🎰 V2 draw pages (visit these URLs):");
  for (const c of createdCampaigns) {
    console.log(`     https://wemembers.store/voucher/${c.slug}`);
  }
  console.log("");
  console.log("  📊 Pool status API:");
  console.log(`     https://wemembers.store/api/campaign/pool-status?slug=${createdCampaigns[0]?.slug || "wem-lucky"}`);
  console.log("");
  console.log("  💡 To let other businesses join the network:");
  console.log("     Register a new business → Create a lucky_draw_v2 campaign → Done!");
  console.log("═".repeat(60) + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
