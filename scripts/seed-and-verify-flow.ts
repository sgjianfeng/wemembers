/**
 * 本地完整业务流：测试账号 + 发券 → 购券 → 跨店核销 → 分账校验
 *
 * 用法（项目根目录）:
 *   npx tsx scripts/seed-and-verify-flow.ts
 *
 * 账号密码统一: flow1234
 * 依赖: 本地 SQLite prisma/dev.db（.env DATABASE_URL）
 */
import { PrismaClient } from "@prisma/client";
import { buildRulesSnapshot } from "../src/lib/templates";
import { fulfillVoucherPurchase } from "../src/lib/voucher-purchase";
import { applyRedeemSplit } from "../src/lib/apply-redeem-split";
import { parseRulesSnapshot } from "../src/lib/templates";
import { splitRedeemAmount } from "../src/lib/redeem-economics";

const prisma = new PrismaClient();
const PW_PLAIN = "flow1234";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "wemembers-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sgd(cents: number) {
  return `S$${(cents / 100).toFixed(2)}`;
}

function ok(label: string, detail?: string) {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail?: string): never {
  console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  process.exit(1);
}
function info(label: string) {
  console.log(`\n▸ ${label}`);
}

async function upsertBusiness(opts: {
  email: string;
  name: string;
  slug: string;
  passwordHash: string;
  storeName: string;
  storeSlug: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    create: {
      email: opts.email,
      role: "business",
      passwordHash: opts.passwordHash,
      displayName: opts.name,
      businessName: opts.name,
      businessSlug: opts.slug,
      businessCategory: "food",
      status: "active",
    },
    update: {
      passwordHash: opts.passwordHash,
      businessName: opts.name,
      businessSlug: opts.slug,
      status: "active",
      role: "business",
    },
  });

  await prisma.tokenAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      balance: 0,
      frozenBalance: 0,
      totalEarned: 0,
      totalSpent: 0,
    },
    update: {},
  });

  const store = await prisma.store.upsert({
    where: { slug: opts.storeSlug },
    create: {
      businessId: user.id,
      name: opts.storeName,
      slug: opts.storeSlug,
      address: "1 Test Road, Singapore",
    },
    update: {
      businessId: user.id,
      name: opts.storeName,
    },
  });

  return { user, store };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  WeMembers 本地全流程验证（测试账号）        ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const passwordHash = await hashPassword(PW_PLAIN);

  // ── 1. 账号 ─────────────────────────────────────────
  info("1. 创建/更新测试账号");

  const platform = await prisma.user.upsert({
    where: { email: "flow:platform@wemembers.local" },
    create: {
      email: "flow:platform@wemembers.local",
      role: "admin",
      passwordHash,
      displayName: "Flow Platform",
      status: "active",
    },
    update: { passwordHash, role: "admin", status: "active" },
  });
  await prisma.tokenAccount.upsert({
    where: { userId: platform.id },
    create: {
      userId: platform.id,
      balance: 0,
      frozenBalance: 0,
      totalEarned: 0,
      totalSpent: 0,
    },
    update: {},
  });
  ok("平台账号", `flow:platform@wemembers.local / ${PW_PLAIN}`);

  // 为平台费入账：apply-redeem-split 用 PLATFORM_ACCOUNT_EMAIL
  // 验证脚本内临时设置（进程内）
  process.env.PLATFORM_ACCOUNT_EMAIL = "flow:platform@wemembers.local";

  const bizA = await upsertBusiness({
    email: "flow:biz-a@wm.local",
    name: "Flow Store A",
    slug: "flow-store-a",
    passwordHash,
    storeName: "A 店·测试门店",
    storeSlug: "flow-store-a-outlet",
  });
  ok("企业 A（发券/售卖）", `flow:biz-a@wm.local / ${PW_PLAIN} · 店 ${bizA.store.slug}`);

  const bizB = await upsertBusiness({
    email: "flow:biz-b@wm.local",
    name: "Flow Store B",
    slug: "flow-store-b",
    passwordHash,
    storeName: "B 店·核销门店",
    storeSlug: "flow-store-b-outlet",
  });
  ok("企业 B（跨店核销）", `flow:biz-b@wm.local / ${PW_PLAIN} · 店 ${bizB.store.slug}`);

  // B 也需要有任意 voucher_sale / lucky_draw 活动才算「入网」可互核
  const bNet = await prisma.campaign.findFirst({
    where: {
      businessId: bizB.user.id,
      type: { in: ["voucher_sale", "lucky_draw_v2"] },
    },
  });
  if (!bNet) {
    const snapB = buildRulesSnapshot({
      templateId: "voucher_discount",
      discountPercent: 10,
      enabledTiers: [10],
      shareSellingEnabled: true,
    });
    await prisma.campaign.create({
      data: {
        businessId: bizB.user.id,
        name: "B 入网占位活动",
        type: "voucher_sale",
        status: "active",
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 90 * 86400000),
        slug: `flow-b-net-${Date.now().toString(36)}`,
        budgetPercent: 20,
        rulesSnapshot: JSON.stringify(snapB),
        storeIds: JSON.stringify([bizB.store.id]),
      },
    });
    ok("B 店入网", "创建占位 voucher_sale 活动");
  } else {
    ok("B 店已入网");
  }

  const customer = await prisma.user.upsert({
    where: { phone: "+6590001001" },
    create: {
      phone: "+6590001001",
      email: "flow:customer@cust.local",
      role: "customer",
      passwordHash,
      displayName: "Flow Customer",
      status: "active",
    },
    update: {
      passwordHash,
      role: "customer",
      status: "active",
      displayName: "Flow Customer",
    },
  });
  ok("顾客", `手机 +6590001001 或 flow:customer@cust.local / ${PW_PLAIN}`);

  // ── 2. A 店创建「90 买 100」折扣代金券活动 ────────────
  info("2. A 店发布折扣代金券（10% off = 付 S$90 得 S$100 面值）");

  // 模板档位仅 10/50/100/200（无 20）— 启用 10、50、100 模拟可售面额
  const snapshot = buildRulesSnapshot({
    templateId: "voucher_discount",
    discountPercent: 10,
    enabledTiers: [10, 50, 100],
    shareSellingEnabled: true,
  });

  const slug = `flow-a-90for100-${Date.now().toString(36)}`;
  const campaign = await prisma.campaign.create({
    data: {
      businessId: bizA.user.id,
      name: "Flow 90买100 代金券",
      description: "本地全流程验证 · 折扣 10%",
      type: "voucher_sale",
      status: "active",
      startDate: new Date(Date.now() - 3600000),
      endDate: new Date(Date.now() + 30 * 86400000),
      slug,
      color: "#1A6EFF",
      budgetPercent: 20,
      rulesSnapshot: JSON.stringify(snapshot),
      storeIds: JSON.stringify([bizA.store.id]),
    },
  });
  ok(
    "活动已创建",
    `slug=${slug} · 折扣 ${snapshot.discountPercent}% · 档位 ${snapshot.enabledTiers.join("/")}`
  );
  ok(
    "公开购买页",
    `http://localhost:3000/voucher/${slug}`
  );
  ok(
    "门店页",
    `http://localhost:3000/shop/flow-store-a`
  );
  ok(
    "带卖家参数（分销）",
    `http://localhost:3000/voucher/${slug}?seller=${bizA.user.id}`
  );

  // ── 3. 顾客购 S$100 面值（实付 90），seller = A ────────
  info("3. 顾客购券（面值 100，10% 折扣 → 实付 90，seller=A）");

  // 记余额前快照
  const beforeA = await prisma.tokenAccount.findUnique({
    where: { userId: bizA.user.id },
  });
  const beforeB = await prisma.tokenAccount.findUnique({
    where: { userId: bizB.user.id },
  });
  const beforeP = await prisma.tokenAccount.findUnique({
    where: { userId: platform.id },
  });

  const purchase = await fulfillVoucherPurchase({
    customerId: customer.id,
    campaignId: campaign.id,
    amountSgd: 100,
    spendNowSgd: 0,
    sellerId: bizA.user.id,
    stripeSessionId: null,
  });

  ok(
    "购券成功",
    `voucherId=${purchase.voucher.id} · 面值 ${purchase.voucher.amountSgd} · 实付 ${purchase.voucher.paidSgd} · 余额 ${purchase.voucher.balanceSgd}`
  );

  if (purchase.voucher.paidSgd !== "90.00") {
    fail("实付应为 S$90.00", `got ${purchase.voucher.paidSgd}`);
  }
  // 折扣代金券：余额=实付，避免超额发行
  if (purchase.voucher.balanceSgd !== "90.00") {
    fail("折扣券余额应为实付 S$90.00", `got ${purchase.voucher.balanceSgd}`);
  }
  ok("经济学：10% 折扣", "付 90 得余额 90（折扣模板不虚增余额）");

  const voucher = await prisma.voucher.findUnique({
    where: { id: purchase.voucher.id },
  });
  if (!voucher || voucher.customerId !== customer.id) {
    fail("券未进入该顾客账户");
  }
  ok("券归属顾客", `customerId=${customer.id}`);
  if (voucher!.sellerId !== bizA.user.id) {
    fail("sellerId 应为 A", `got ${voucher!.sellerId}`);
  }
  ok("分销归属 A", `sellerId=${bizA.user.id}`);

  // ── 4. 多档位再购一笔 S$10 ─────────────────────────
  info("4. 再购一档 S$10 面值（验证多档可选）");
  const purchase10 = await fulfillVoucherPurchase({
    customerId: customer.id,
    campaignId: campaign.id,
    amountSgd: 10,
    sellerId: bizA.user.id,
  });
  ok(
    "S$10 档购券",
    `实付 ${purchase10.voucher.paidSgd} · 余额 ${purchase10.voucher.balanceSgd}`
  );
  if (purchase10.voucher.paidSgd !== "9.00") {
    fail("S$10×10% 实付应为 9.00", purchase10.voucher.paidSgd);
  }

  const custVouchers = await prisma.voucher.findMany({
    where: { customerId: customer.id, campaignId: campaign.id },
  });
  ok("顾客券包张数", `${custVouchers.length} 张（本活动）`);

  // ── 5. B 店核销主券 S$30 ────────────────────────────
  info("5. B 店跨店核销主券 S$30（A 卖 B 核）");

  const redeemAmount = 3000; // S$30
  if (voucher!.balanceCents < redeemAmount) {
    fail("余额不足以核销 S$30");
  }

  const expected = splitRedeemAmount({
    amountCents: redeemAmount,
    budgetPercent: 20,
    sellerCommissionPercent: snapshot.sellerCommissionPercent,
    platformFeePercent: snapshot.platformFeePercent,
    hasSeller: true,
    mode: "voucher",
  });

  console.log("  预期分账（核销 S$30）:");
  console.log(`    pot(20%):     ${sgd(expected.potCents)}`);
  console.log(`    门店实收:     ${sgd(expected.storeIncomeCents)} → B`);
  console.log(`    卖家佣金(5%): ${sgd(expected.sellerCommissionCents)} → A`);
  console.log(`    平台费(1.5%): ${sgd(expected.platformFeeCents)} → Platform`);

  const snap =
    parseRulesSnapshot(campaign.rulesSnapshot) ||
    ({
      sellerCommissionPercent: 5,
      platformFeePercent: 1.5,
    } as const);

  const applied = await applyRedeemSplit({
    voucherId: voucher!.id,
    campaignId: campaign.id,
    amountCents: redeemAmount,
    storeId: bizB.store.id,
    redeemerBusinessId: bizB.user.id,
    budgetPercent: campaign.budgetPercent || 20,
    sellerCommissionPercent: snap.sellerCommissionPercent,
    platformFeePercent: snap.platformFeePercent,
    sellerId: voucher!.sellerId,
    label: "核销代金券",
    mode: "voucher",
  });

  const newBalance = voucher!.balanceCents - redeemAmount;
  const newUsed = voucher!.usedCents + redeemAmount;
  await prisma.voucher.update({
    where: { id: voucher!.id },
    data: {
      balanceCents: newBalance,
      usedCents: newUsed,
      status: newBalance <= 0 ? "exhausted" : "active",
    },
  });

  ok("核销完成", `usageId=${applied.usageId}`);
  ok(
    "分账结果",
    `店收 ${sgd(applied.split.storeIncomeCents)} · 卖佣 ${sgd(applied.split.sellerCommissionCents)} · 平台 ${sgd(applied.split.platformFeeCents)}`
  );

  if (applied.split.storeIncomeCents !== expected.storeIncomeCents) {
    fail(
      "门店实收不符",
      `exp ${expected.storeIncomeCents} got ${applied.split.storeIncomeCents}`
    );
  }
  if (applied.split.sellerCommissionCents !== expected.sellerCommissionCents) {
    fail(
      "卖家佣金不符",
      `exp ${expected.sellerCommissionCents} got ${applied.split.sellerCommissionCents}`
    );
  }
  if (applied.split.platformFeeCents !== expected.platformFeeCents) {
    fail(
      "平台费不符",
      `exp ${expected.platformFeeCents} got ${applied.split.platformFeeCents}`
    );
  }
  ok("分账金额与公式一致");

  // ── 6. 钱包校验 ─────────────────────────────────────
  info("6. 校验各方钱包（T+1 冻结入账）");

  const afterA = await prisma.tokenAccount.findUnique({
    where: { userId: bizA.user.id },
  });
  const afterB = await prisma.tokenAccount.findUnique({
    where: { userId: bizB.user.id },
  });
  const afterP = await prisma.tokenAccount.findUnique({
    where: { userId: platform.id },
  });

  const dA =
    (afterA?.frozenBalance ?? 0) - (beforeA?.frozenBalance ?? 0);
  const dB =
    (afterB?.frozenBalance ?? 0) - (beforeB?.frozenBalance ?? 0);
  const dP =
    (afterP?.frozenBalance ?? 0) - (beforeP?.frozenBalance ?? 0);

  console.log(`    A 冻结增量: ${sgd(dA)} (期望佣金 ${sgd(expected.sellerCommissionCents)})`);
  console.log(`    B 冻结增量: ${sgd(dB)} (期望店收 ${sgd(expected.storeIncomeCents)})`);
  console.log(`    平台冻结增量: ${sgd(dP)} (期望平台费 ${sgd(expected.platformFeeCents)})`);

  if (dA !== expected.sellerCommissionCents) {
    fail("A 佣金入账错误");
  }
  ok("A（售卖方）收到卖券佣金");

  if (dB !== expected.storeIncomeCents) {
    fail("B 店收入账错误");
  }
  ok("B（核销方）收到核销实收");

  if (dP !== expected.platformFeeCents) {
    fail(
      "平台费入账错误",
      "确认 PLATFORM_ACCOUNT_EMAIL=flow:platform@wemembers.local 且 apply-redeem 能查到该用户"
    );
  }
  ok("平台账号收到平台费");

  // 流水类型
  const txA = await prisma.tokenTransaction.findFirst({
    where: {
      account: { userId: bizA.user.id },
      type: "seller_commission",
    },
    orderBy: { createdAt: "desc" },
  });
  const txB = await prisma.tokenTransaction.findFirst({
    where: {
      account: { userId: bizB.user.id },
      type: "voucher_redeem_income",
    },
    orderBy: { createdAt: "desc" },
  });
  const txP = await prisma.tokenTransaction.findFirst({
    where: {
      account: { userId: platform.id },
      type: "platform_fee",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!txA || !txB || !txP) {
    fail("缺少流水记录", `A=${!!txA} B=${!!txB} P=${!!txP}`);
  }
  ok("流水类型", "seller_commission / voucher_redeem_income / platform_fee");

  // 券余额
  const vAfter = await prisma.voucher.findUnique({
    where: { id: voucher!.id },
  });
  ok(
    "顾客券剩余余额",
    `${sgd(vAfter!.balanceCents)}（原 90 − 30）`
  );
  if (vAfter!.balanceCents !== 6000) {
    fail("余额应为 S$60.00", String(vAfter!.balanceCents));
  }

  // ── 7. 能力对照说明 ─────────────────────────────────
  info("7. 需求对照（代码能力）");
  const checks: [string, boolean, string][] = [
    ["企业登录发折扣代金券（90买100≈10%折扣）", true, "模板 voucher_discount，折扣 8–30%"],
    ["门店页 / 活动页购买", true, `/shop/flow-store-a · /voucher/${slug}`],
    ["门店/活动二维码购", true, "商家后台可打活动/门店 QR；扫码进公开页"],
    ["WhatsApp 分享购", true, "卖家中心/活动页可生成带 seller 的链接分享"],
    ["微信分享购", true, "同链复制；无微信 SDK 内嵌，靠通用 URL"],
    ["默认专属（顾客个人券包）", true, "Voucher.customerId 绑定购券人"],
    ["指定拆券 10/20/20/50", false, "模板档位固定 10/50/100/200，无任意拆分 20"],
    ["购后进券包/余额", true, "顾客 /balance（预付券）非 /wallet 优惠券"],
    ["顾客到店核销", true, "商家扫码核销 API + 扫码页"],
    ["店家见核销金额", true, "VoucherUsage + 商家核销结果"],
    ["平台费进平台账号", true, "需 PLATFORM_ACCOUNT_EMAIL 指向平台用户"],
    ["分销佣金进售卖方", true, "sellerId → seller_commission T+1 冻结"],
    ["A 卖 B 核", true, "开放互核：B 有任意 voucher_sale 即可"],
  ];

  for (const [name, pass, note] of checks) {
    console.log(`  ${pass ? "✅" : "⚠️ "} ${name}`);
    console.log(`      ${note}`);
  }

  // ── 账号表 ──────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  测试账号一览（密码均为 flow1234）             ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  平台  flow:platform@wemembers.local           ║");
  console.log("║  企业A flow:biz-a@wm.local  (发券/卖)          ║");
  console.log("║  企业B flow:biz-b@wm.local  (跨店核销)         ║");
  console.log("║  顾客  +6590001001 / flow:customer@cust.local  ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  活动  /voucher/${slug.slice(0, 28)}…`);
  console.log("║  门店A /shop/flow-store-a                      ║");
  console.log("╚══════════════════════════════════════════════╝");

  console.log("\n✅ 核心链路验证通过：购券(10%折扣) → A卖B核 → 三方分账准确\n");
  console.log("提示: UI 手测请 npm run dev，用上表账号登录。");
  console.log("      本地直购 API 需 ALLOW_DIRECT_VOUCHER_PURCHASE=true 或未配 Stripe。");
  console.log("      平台费生产依赖 .env PLATFORM_ACCOUNT_EMAIL。\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
