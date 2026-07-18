/**
 * Month simulation seed — multi-role + ~30 days prepaid voucher activity.
 *
 * Creates:
 *   1 admin (platform)
 *   3 businesses × 2 stores each + staff
 *   15 customers + 5 promoters
 *   Draw + discount campaigns per business
 *   ~30 days of purchases, redemptions, commissions, partial withdrawals
 *
 * Run:
 *   npx tsx prisma/seed-month.ts
 *   npm run db:seed-month
 *
 * Login (password for email accounts):
 *   Admin:    month-admin@wemembers.test / month-demo-2026
 *   Business: month-biz-a@wemembers.test / month-demo-2026
 *   Customers use phone OTP (codes in VerificationCode when testing login)
 */
import { PrismaClient } from "@prisma/client";
import {
  buildRulesSnapshot,
  computePurchaseSplit,
} from "../src/lib/templates";
import { splitRedeemAmount } from "../src/lib/redeem-economics";
import { calculateTierWeight, splitPoolFunding } from "../src/lib/draw-v2";
import { tPlusOneUnlockAt } from "../src/lib/tokens";

const prisma = new PrismaClient();

const PREFIX = "month:";
const PASSWORD = process.env.SEED_MONTH_PASSWORD || "month-demo-2026";
const NOW = new Date();

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "wemembers-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function daysAgo(d: number, hour = 12): Date {
  const t = new Date(NOW);
  t.setDate(t.getDate() - d);
  t.setHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return t;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function cleanup() {
  console.log("🧹 Cleaning previous month-seed users…");
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: "month-" } },
        { email: { startsWith: PREFIX } },
        { phone: { startsWith: "+6598" } },
        { displayName: { startsWith: "Month " } },
      ],
    },
    select: { id: true, role: true },
  });
  const ids = users.map((u) => u.id);
  const bizIds = users.filter((u) => u.role === "business").map((u) => u.id);
  if (!ids.length) {
    console.log("  (nothing to clean)\n");
    return;
  }

  const camps = await prisma.campaign.findMany({
    where: { businessId: { in: bizIds } },
    select: { id: true },
  });
  const campIds = camps.map((c) => c.id);

  // Vouchers by campaign or customer or seller
  const vouchers = await prisma.voucher.findMany({
    where: {
      OR: [
        { campaignId: { in: campIds.length ? campIds : ["__none__"] } },
        { customerId: { in: ids } },
        { sellerId: { in: ids } },
      ],
    },
    select: { id: true },
  });
  const vIds = vouchers.map((v) => v.id);
  if (vIds.length) {
    await prisma.voucherDraw.deleteMany({ where: { voucherId: { in: vIds } } });
    await prisma.voucherUsage.deleteMany({ where: { voucherId: { in: vIds } } });
    await prisma.voucher.deleteMany({ where: { id: { in: vIds } } });
  }

  if (campIds.length) {
    await prisma.drawTicket.deleteMany({ where: { campaignId: { in: campIds } } }).catch(() => null);
    await prisma.luckyDrawEntry.deleteMany({ where: { campaignId: { in: campIds } } }).catch(() => null);
    await prisma.lotteryPrize.deleteMany({ where: { campaignId: { in: campIds } } }).catch(() => null);
    await prisma.campaignJoinRequest.deleteMany({ where: { campaignId: { in: campIds } } }).catch(() => null);
    await prisma.campaign.deleteMany({ where: { id: { in: campIds } } });
  }

  await prisma.businessPartner.deleteMany({
    where: { OR: [{ businessId: { in: ids } }, { partnerId: { in: ids } }] },
  }).catch(() => null);

  await prisma.promoterEarning.deleteMany({ where: { promoterId: { in: ids } } }).catch(() => null);
  await prisma.promoterLink.deleteMany({ where: { promoterId: { in: ids } } }).catch(() => null);
  await prisma.promoterAccount.deleteMany({ where: { userId: { in: ids } } });

  await prisma.tokenTransaction.deleteMany({
    where: { account: { userId: { in: ids } } },
  });
  await prisma.tokenAccount.deleteMany({ where: { userId: { in: ids } } });
  await prisma.stripeAccount.deleteMany({ where: { userId: { in: ids } } }).catch(() => null);

  const mems = await prisma.membership.findMany({
    where: { OR: [{ businessId: { in: ids } }, { customerId: { in: ids } }] },
    select: { id: true },
  });
  if (mems.length) {
    await prisma.pointsLog.deleteMany({
      where: { membershipId: { in: mems.map((m) => m.id) } },
    }).catch(() => null);
  }
  await prisma.membership.deleteMany({
    where: { OR: [{ businessId: { in: ids } }, { customerId: { in: ids } }] },
  });

  // Detach staff from stores then delete stores
  await prisma.user.updateMany({
    where: { id: { in: ids }, role: "staff" },
    data: { storeId: null },
  });
  await prisma.store.deleteMany({ where: { businessId: { in: bizIds } } });

  await prisma.checkIn.deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await prisma.userBadge.deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await prisma.verificationCode.deleteMany({
    where: { OR: [{ contact: { startsWith: "+6598" } }, { contact: { startsWith: "month-" } }] },
  }).catch(() => null);

  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`  removed ${ids.length} users\n`);
}

async function main() {
  console.log("📅 WeMembers — Month simulation seed\n");
  const pw = await hashPassword(PASSWORD);
  await cleanup();

  /* ── Admin / platform ── */
  console.log("👑 Admin…");
  const platformEmail =
    process.env.PLATFORM_ACCOUNT_EMAIL || "month-admin@wemembers.test";
  let admin = await prisma.user.findUnique({ where: { email: platformEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: platformEmail,
        role: "admin",
        displayName: "Month Platform Admin",
        passwordHash: pw,
        tokenAccount: { create: { balance: 0, totalEarned: 0 } },
      },
    });
  } else {
    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: pw, role: "admin" },
    });
  }

  /* ── Businesses + stores + staff ── */
  console.log("🏪 Businesses & stores…");
  const bizDefs = [
    { key: "a", name: "Month Café A", email: "month-biz-a@wemembers.test", cat: "cafe" },
    { key: "b", name: "Month Bistro B", email: "month-biz-b@wemembers.test", cat: "food" },
    { key: "c", name: "Month Mart C", email: "month-biz-c@wemembers.test", cat: "retail" },
  ] as const;

  type BizPack = {
    user: { id: string };
    stores: { id: string; name: string }[];
    drawSlug: string;
    discountSlug: string;
    drawId: string;
    discountId: string;
  };
  const businesses: Record<string, BizPack> = {};

  for (const def of bizDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        role: "business",
        displayName: def.name,
        businessName: def.name,
        businessCategory: def.cat,
        businessSlug: `month-${def.key}-${Date.now().toString(36)}`,
        passwordHash: pw,
        tokenAccount: {
          create: { balance: 50_000, frozenBalance: 10_000, totalEarned: 80_000 },
        },
      },
    });

    const stores = [];
    for (let i = 1; i <= 2; i++) {
      const store = await prisma.store.create({
        data: {
          businessId: user.id,
          name: `${def.name} · Store ${i}`,
          slug: `month-${def.key}-s${i}-${Date.now().toString(36)}`,
          address: `${i} Month Demo Road, Singapore`,
        },
      });
      stores.push(store);

      await prisma.user.create({
        data: {
          phone: `+6598${def.key.charCodeAt(0)}${i}${String(Date.now()).slice(-6)}`.slice(0, 15),
          role: "staff",
          displayName: `Month Staff ${def.key.toUpperCase()}${i}`,
          storeId: store.id,
          passwordHash: pw,
        },
      });
    }

    const drawSnap = buildRulesSnapshot({ templateId: "draw_standard" });
    const discSnap = buildRulesSnapshot({
      templateId: "voucher_discount",
      discountPercent: 15,
    });
    const drawSlug = `month-draw-${def.key}-${Date.now().toString(36)}`;
    const discountSlug = `month-disc-${def.key}-${Date.now().toString(36)}`;

    const draw = await prisma.campaign.create({
      data: {
        businessId: user.id,
        name: `${def.name} 抽奖`,
        type: "lucky_draw_v2",
        status: "active",
        startDate: daysAgo(35),
        endDate: new Date(NOW.getTime() + 60 * 86400000),
        drawDate: new Date(NOW.getTime() + 60 * 86400000),
        budgetPercent: 20,
        instantPoolRatio: 20,
        midPoolRatio: 0,
        grandPoolRatio: 80,
        slug: drawSlug,
        templateId: "draw_standard",
        rulesSnapshot: JSON.stringify(drawSnap),
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        allowCollaboration: true,
        joinable: def.key === "a",
        color: "#FF6B35",
      },
    });

    const discount = await prisma.campaign.create({
      data: {
        businessId: user.id,
        name: `${def.name} 折扣券`,
        type: "voucher_sale",
        status: "active",
        startDate: daysAgo(35),
        endDate: new Date(NOW.getTime() + 60 * 86400000),
        budgetPercent: 20,
        instantPoolRatio: 0,
        midPoolRatio: 0,
        grandPoolRatio: 0,
        slug: discountSlug,
        templateId: "voucher_discount",
        rulesSnapshot: JSON.stringify(discSnap),
        storeIds: JSON.stringify(stores.map((s) => s.id)),
        allowCollaboration: true,
        color: "#1A6EFF",
      },
    });

    businesses[def.key] = {
      user,
      stores,
      drawSlug,
      discountSlug,
      drawId: draw.id,
      discountId: discount.id,
    };
    console.log(`  ✅ ${def.name} · ${drawSlug} · ${discountSlug}`);
  }

  /* ── Customers + promoters ── */
  console.log("👥 Customers & promoters…");
  const customers: { id: string; phone: string }[] = [];
  for (let i = 1; i <= 15; i++) {
    const phone = `+6598100${String(i).padStart(4, "0")}`;
    const u = await prisma.user.create({
      data: {
        phone,
        role: "customer",
        displayName: `Month Customer ${i}`,
        passwordHash: pw,
        pointsBalance: rand(100, 2000),
        lifetimePoints: rand(100, 5000),
        tokenAccount: { create: { balance: rand(0, 5000), totalEarned: 100 } },
      },
    });
    customers.push({ id: u.id, phone });
  }

  const promoters: { id: string; phone: string }[] = [];
  for (let i = 1; i <= 5; i++) {
    const phone = `+6598200${String(i).padStart(4, "0")}`;
    const u = await prisma.user.create({
      data: {
        phone,
        role: "customer",
        displayName: `Month Promoter ${i}`,
        passwordHash: pw,
        tokenAccount: {
          create: { balance: rand(1000, 8000), frozenBalance: rand(0, 2000), totalEarned: 10000 },
        },
        promoterAccount: {
          create: { isActive: true, level: rand(1, 3), totalEarned: rand(5000, 50000) },
        },
      },
    });
    promoters.push({ id: u.id, phone });
  }

  /* ── 30 days of activity ── */
  console.log("📈 Simulating ~30 days of purchases & redeems…");
  const faces = [50, 100, 200];
  let purchaseCount = 0;
  let redeemCount = 0;

  for (let day = 29; day >= 0; day--) {
    const purchasesToday = rand(2, 6);
    for (let p = 0; p < purchasesToday; p++) {
      const biz = pick(Object.values(businesses));
      const useDraw = Math.random() > 0.35;
      const campaignId = useDraw ? biz.drawId : biz.discountId;
      const customer = pick(customers);
      const faceSgd = pick(faces);
      const faceCents = faceSgd * 100;
      const snap = useDraw
        ? buildRulesSnapshot({ templateId: "draw_standard" })
        : buildRulesSnapshot({ templateId: "voucher_discount", discountPercent: 15 });
      const hasSeller = Math.random() > 0.4;
      const sellerId = hasSeller
        ? Math.random() > 0.5
          ? pick(promoters).id
          : pick(Object.values(businesses)).user.id
        : null;
      // self-sell guard
      const safeSeller =
        sellerId && sellerId !== customer.id ? sellerId : hasSeller ? pick(promoters).id : null;

      const split = computePurchaseSplit(faceCents, snap, Boolean(safeSeller));
      const creditCents = useDraw ? faceCents : split.paidCents;
      const spendNow = Math.random() > 0.7 ? Math.floor(creditCents * 0.2) : 0;
      const balanceCents = creditCents - spendNow;
      const createdAt = daysAgo(day, rand(9, 21));
      const tier =
        faceSgd <= 20 ? "small" : faceSgd <= 50 ? "medium" : "large";
      const weight = useDraw
        ? calculateTierWeight(faceCents, tier as "small" | "medium" | "large", balanceCents, 0, spendNow)
        : 0;

      const voucher = await prisma.voucher.create({
        data: {
          customerId: customer.id,
          campaignId,
          sellerId: safeSeller,
          amountCents: creditCents,
          paidCents: split.paidCents,
          sellerCommissionCents: 0,
          platformFeeCents: 0,
          usedCents: spendNow,
          balanceCents,
          prizePoolContribution: 0,
          drawWeight: weight,
          tier,
          status: "active",
          createdAt,
          updatedAt: createdAt,
        },
      });
      purchaseCount++;

      if (useDraw) {
        await prisma.voucherDraw.create({
          data: {
            voucherId: voucher.id,
            drawType: "instant",
            won: true,
            prizeName: pick(["S$1 代金券", "S$0.50 代金券", "S$2 代金券"]),
            prizeIcon: "🎫",
            valueCents: pick([50, 100, 200]),
            createdAt,
          },
        });
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            entryCount: { increment: 1 },
            totalTicketCount: { increment: 1 },
          },
        });
      }

      // Optional spend-now as usage
      let used = spendNow;
      let bal = balanceCents;
      let commission = 0;
      let platform = 0;
      let pool = 0;

      const store = pick(biz.stores);
      if (spendNow > 0) {
        const r = splitRedeemAmount({
          amountCents: spendNow,
          hasSeller: Boolean(safeSeller),
          mode: useDraw ? "draw" : "voucher",
        });
        await prisma.voucherUsage.create({
          data: {
            voucherId: voucher.id,
            storeId: store.id,
            amountCents: r.amountCents,
            feeCents: r.potCents,
            storeIncome: r.storeIncomeCents,
            createdAt,
          },
        });
        commission += r.sellerCommissionCents;
        platform += r.platformFeeCents;
        pool += r.prizePoolCents;
        if (useDraw && r.prizePoolCents > 0) {
          const { smallCents, grandCents } = splitPoolFunding(r.prizePoolCents);
          await prisma.campaign.update({
            where: { id: campaignId },
            data: {
              instantPoolCents: { increment: smallCents },
              grandPoolCents: { increment: grandCents },
            },
          });
        }
        redeemCount++;
      }

      // Later redemptions (same or other network store)
      if (bal > 500 && Math.random() > 0.25) {
        const redeemDay = Math.max(0, day - rand(0, Math.min(5, day)));
        const redeemAt = daysAgo(redeemDay, rand(10, 20));
        const otherBiz = pick(Object.values(businesses));
        const redeemStore = pick(otherBiz.stores);
        const amount = Math.min(bal, rand(500, Math.min(bal, 5000)));
        const r = splitRedeemAmount({
          amountCents: amount,
          hasSeller: Boolean(safeSeller),
          mode: useDraw ? "draw" : "voucher",
        });
        await prisma.voucherUsage.create({
          data: {
            voucherId: voucher.id,
            storeId: redeemStore.id,
            amountCents: r.amountCents,
            feeCents: r.potCents,
            storeIncome: r.storeIncomeCents,
            createdAt: redeemAt,
          },
        });
        used += amount;
        bal -= amount;
        commission += r.sellerCommissionCents;
        platform += r.platformFeeCents;
        pool += r.prizePoolCents;
        redeemCount++;

        if (useDraw && r.prizePoolCents > 0) {
          const { smallCents, grandCents } = splitPoolFunding(r.prizePoolCents);
          await prisma.campaign.update({
            where: { id: campaignId },
            data: {
              instantPoolCents: { increment: smallCents },
              grandPoolCents: { increment: grandCents },
            },
          });
        }

        // Credit redeeming business wallet (simplified historical)
        const redeemerBizId = otherBiz.user.id;
        const acct = await prisma.tokenAccount.findUnique({
          where: { userId: redeemerBizId },
        });
        if (acct && r.storeIncomeCents > 0) {
          const unlock = tPlusOneUnlockAt(redeemAt);
          const matured = unlock.getTime() <= NOW.getTime();
          await prisma.tokenAccount.update({
            where: { id: acct.id },
            data: matured
              ? {
                  balance: { increment: r.storeIncomeCents },
                  totalEarned: { increment: r.storeIncomeCents },
                }
              : {
                  frozenBalance: { increment: r.storeIncomeCents },
                  totalEarned: { increment: r.storeIncomeCents },
                },
          });
          await prisma.tokenTransaction.create({
            data: {
              accountId: acct.id,
              amount: r.storeIncomeCents,
              type: "voucher_redeem_income",
              description: `Month seed 核销 · S$${(r.storeIncomeCents / 100).toFixed(2)}`,
              referenceId: voucher.id,
              balanceAfter: acct.balance + (matured ? r.storeIncomeCents : 0),
              availableAt: unlock,
              releasedAt: matured ? NOW : null,
              createdAt: redeemAt,
            },
          });
        }

        if (safeSeller && r.sellerCommissionCents > 0) {
          const sAcct = await prisma.tokenAccount.findUnique({
            where: { userId: safeSeller },
          });
          if (sAcct) {
            const unlock = tPlusOneUnlockAt(redeemAt);
            const matured = unlock.getTime() <= NOW.getTime();
            await prisma.tokenAccount.update({
              where: { id: sAcct.id },
              data: matured
                ? {
                    balance: { increment: r.sellerCommissionCents },
                    totalEarned: { increment: r.sellerCommissionCents },
                  }
                : {
                    frozenBalance: { increment: r.sellerCommissionCents },
                    totalEarned: { increment: r.sellerCommissionCents },
                  },
            });
            await prisma.tokenTransaction.create({
              data: {
                accountId: sAcct.id,
                amount: r.sellerCommissionCents,
                type: "seller_commission",
                description: `Month seed 佣金 · S$${(r.sellerCommissionCents / 100).toFixed(2)}`,
                referenceId: voucher.id,
                balanceAfter: sAcct.balance + (matured ? r.sellerCommissionCents : 0),
                availableAt: unlock,
                releasedAt: matured ? NOW : null,
                createdAt: redeemAt,
              },
            });
          }
        }
      }

      // Rare full withdraw of leftover
      if (bal > 1000 && Math.random() > 0.92) {
        const wAt = daysAgo(Math.max(0, day - 1));
        await prisma.voucher.update({
          where: { id: voucher.id },
          data: {
            balanceCents: 0,
            withdrawnCents: bal,
            usedCents: used,
            sellerCommissionCents: commission,
            platformFeeCents: platform,
            prizePoolContribution: pool,
            drawWeight: 0,
            status: used > 0 ? "exhausted" : "withdrawn",
            updatedAt: wAt,
          },
        });
      } else {
        const newWeight = useDraw
          ? calculateTierWeight(
              creditCents,
              tier as "small" | "medium" | "large",
              bal,
              0,
              used
            )
          : 0;
        await prisma.voucher.update({
          where: { id: voucher.id },
          data: {
            usedCents: used,
            balanceCents: bal,
            sellerCommissionCents: commission,
            platformFeeCents: platform,
            prizePoolContribution: pool,
            drawWeight: newWeight,
            status: bal <= 0 ? "exhausted" : "active",
          },
        });
      }
    }
  }

  console.log(`\n✅ Month seed complete`);
  console.log(`   Purchases ~${purchaseCount} · Redeems ~${redeemCount}`);
  console.log("\n── Login (password accounts) ──");
  console.log(`   Admin:     ${platformEmail}`);
  console.log(`   BusinessA: month-biz-a@wemembers.test`);
  console.log(`   BusinessB: month-biz-b@wemembers.test`);
  console.log(`   BusinessC: month-biz-c@wemembers.test`);
  console.log(`   Password:  ${PASSWORD}`);
  console.log("\n── Customer phones (OTP login in app) ──");
  console.log(`   Customers: +65981000001 … +65981000015`);
  console.log(`   Promoters: +65982000001 … +65982000005 (promoter active)`);
  console.log("\n── Sample slugs ──");
  console.log(`   Draw A:     ${businesses.a.drawSlug}`);
  console.log(`   Discount A: ${businesses.a.discountSlug}`);
  console.log(`   Draw B:     ${businesses.b.drawSlug}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
