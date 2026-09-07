/**
 * 每日将 wemembers 的门店汇总推入 nexuswork。
 *
 * 环境变量：
 *   NEXUSWORK_LEDGER_TOKEN=创建后只显示一次的集成 token
 *   NEXUSWORK_LEDGER_TARGETS='{"<wm store id>":{"conversationCode":"S-MEOWBBQ-CT"}}'
 * 可选：NEXUSWORK_URL=https://work.wemembers.store
 * 用法：npx tsx scripts/push-to-nexuswork.ts [--date 2026-09-05] [--customers] [--settlements] [--dry-run]
 *
 * 每日推经营汇总；周一额外推顾客画像（或用 --customers 手工触发）。画像只有手机号
 * 末四位及聚合值，不带姓名或逐笔流水。externalKey 稳定，重推由接收端跳过或冲正。
 */
import { prisma } from "../src/lib/db";
import { customerProfileRow, normalizeCustomerPhone } from "../src/lib/nexuswork-customer-profile";

type Target = { conversationCode: string; spendLedgerCode?: string; redeemLedgerCode?: string; customerLedgerCode?: string };
type Targets = Record<string, Target>;
type SettlementTargets = Record<string, { conversationCode: string; ledgerCode?: string }>;
type Row = Record<string, string | number> & { externalKey: string };

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * 不带 --date 时聚合的是**新加坡时间的昨天**，不是今天。
 * cron 在 00:10 触发，此刻「今天」只过了十分钟，聚合出来必然是零；
 * 而 externalKey 按天固定、写入又是幂等跳过，那行零会永久钉死在台账里。
 */
function singaporeDay(value?: string) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const day = value ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(yesterday);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T00:00:00+08:00`).getTime())) {
    throw new Error("--date 必须是 YYYY-MM-DD");
  }
  const start = new Date(`${day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { day, start, end };
}

function targetsFromEnv(): Targets {
  const raw = process.env.NEXUSWORK_LEDGER_TARGETS;
  if (!raw) throw new Error("缺少 NEXUSWORK_LEDGER_TARGETS");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("NEXUSWORK_LEDGER_TARGETS 不是合法 JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("NEXUSWORK_LEDGER_TARGETS 必须是对象");
  for (const [storeId, target] of Object.entries(parsed as Targets)) {
    if (!target || typeof target.conversationCode !== "string" || !target.conversationCode) {
      throw new Error(`门店 ${storeId} 没有 conversationCode`);
    }
  }
  return parsed as Targets;
}

function settlementTargetsFromEnv(): SettlementTargets {
  const raw = process.env.NEXUSWORK_SETTLEMENT_TARGETS;
  if (!raw) return {};
  const parsed = JSON.parse(raw) as SettlementTargets;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("NEXUSWORK_SETTLEMENT_TARGETS 必须是对象");
  return parsed;
}

async function post(token: string, baseUrl: string, body: { conversationCode: string; ledgerCode: string; rows: Row[] }, dryRun: boolean) {
  if (body.rows.length === 0) return;
  if (dryRun) {
    console.log("[dry-run]", JSON.stringify(body));
    return;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/integrations/wemembers/ledger`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(`推送 ${body.conversationCode}/${body.ledgerCode} 失败：${response.status} ${JSON.stringify(result)}`);
  console.log(`✓ ${body.conversationCode}/${body.ledgerCode}: 写入 ${result.data.inserted}，跳过 ${result.data.skipped}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { day, start, end } = singaporeDay(arg("--date"));
  const targets = targetsFromEnv();
  const token = process.env.NEXUSWORK_LEDGER_TOKEN;
  if (!dryRun && !token) throw new Error("缺少 NEXUSWORK_LEDGER_TOKEN");
  const baseUrl = process.env.NEXUSWORK_URL ?? "https://work.wemembers.store";

  for (const [storeId, target] of Object.entries(targets)) {
    const [spend, redeem] = await Promise.all([
      prisma.spendRecord.aggregate({
        where: { storeId, status: "settled", createdAt: { gte: start, lt: end } },
        _count: { _all: true }, _sum: { amountCents: true, drawCents: true, platformFeeChargedCents: true },
      }),
      prisma.voucherUsage.aggregate({
        where: { storeId, createdAt: { gte: start, lt: end } },
        _count: { _all: true }, _sum: { amountCents: true, storeIncome: true },
      }),
    ]);
    await post(token ?? "", baseUrl, {
      conversationCode: target.conversationCode,
      ledgerCode: target.spendLedgerCode ?? "SPEND",
      rows: [{ externalKey: `wm-spend-${day}-${storeId}`, happen_at: day, orders: spend._count._all, amount: (spend._sum.amountCents ?? 0) / 100, draw: (spend._sum.drawCents ?? 0) / 100, platform_fee: (spend._sum.platformFeeChargedCents ?? 0) / 100 }],
    }, dryRun);
    await post(token ?? "", baseUrl, {
      conversationCode: target.conversationCode,
      ledgerCode: target.redeemLedgerCode ?? "REDEEM",
      rows: [{ externalKey: `wm-redeem-${day}-${storeId}`, happen_at: day, orders: redeem._count._all, amount: (redeem._sum.amountCents ?? 0) / 100, income: (redeem._sum.storeIncome ?? 0) / 100 }],
    }, dryRun);

    // 周一凌晨的日任务刚好汇总完周日；人工补数可显式带 --customers。
    const pushCustomers = process.argv.includes("--customers") || start.getUTCDay() === 6;
    if (pushCustomers) {
      const profiles = await customerProfiles(storeId);
      const rows = profiles.map((profile) => customerProfileRow(storeId, day, profile));
      for (let offset = 0; offset < rows.length; offset += 500) {
        await post(token ?? "", baseUrl, {
          conversationCode: target.conversationCode,
          ledgerCode: target.customerLedgerCode ?? "CUSTOMER",
          rows: rows.slice(offset, offset + 500),
        }, dryRun);
      }
    }
  }

  const nextDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(end);
  const pushSettlements = process.argv.includes("--settlements") || nextDay.slice(0, 7) !== day.slice(0, 7);
  if (pushSettlements) {
    const period = day.slice(0, 7);
    for (const [businessId, target] of Object.entries(settlementTargetsFromEnv())) {
      const rows = await prisma.settlement.findMany({
        where: { createdAt: { gte: new Date(`${period}-01T00:00:00+08:00`), lt: end }, OR: [{ issuerBusinessId: businessId }, { redeemerBusinessId: businessId }] },
        select: { totalAmount: true, platformFee: true, issuerFee: true, redeemerIncome: true, issuerBusinessId: true, redeemerBusinessId: true },
      });
      await post(token ?? "", baseUrl, {
        conversationCode: target.conversationCode,
        ledgerCode: target.ledgerCode ?? "SETTLE",
        rows: [{
          externalKey: `wm-settle-${period}-${businessId}`, period,
          total: rows.reduce((sum, row) => sum + row.totalAmount, 0) / 100,
          platform_fee: rows.reduce((sum, row) => sum + row.platformFee, 0) / 100,
          issuer_fee: rows.filter((row) => row.issuerBusinessId === businessId).reduce((sum, row) => sum + row.issuerFee, 0) / 100,
          income: rows.filter((row) => row.redeemerBusinessId === businessId).reduce((sum, row) => sum + row.redeemerIncome, 0) / 100,
          status: "待结算",
        }],
      }, dryRun);
    }
  }
}

async function customerProfiles(storeId: string) {
  const spends = await prisma.spendRecord.groupBy({
    by: ["phone"],
    where: { storeId, status: "settled" },
    _min: { createdAt: true },
    _max: { createdAt: true },
    _sum: { amountCents: true },
  });
  if (spends.length === 0) return [];

  const phones = [...new Set(spends.map((row) => normalizeCustomerPhone(row.phone)).filter(Boolean))];
  const candidates = [...new Set(phones.flatMap((phone) => [phone, `+65${phone}`]))];
  const users = await prisma.user.findMany({ where: { phone: { in: candidates } }, select: { id: true, phone: true } });
  const phoneByUser = new Map(users.map((user) => [user.id, normalizeCustomerPhone(user.phone ?? "")]));
  const balances = users.length === 0 ? [] : await prisma.voucher.groupBy({
    by: ["customerId"],
    where: { storeId, status: "active", customerId: { in: users.map((user) => user.id) } },
    _sum: { balanceCents: true },
  });
  const balanceByPhone = new Map<string, number>();
  for (const row of balances) {
    const phone = phoneByUser.get(row.customerId);
    if (phone) balanceByPhone.set(phone, (balanceByPhone.get(phone) ?? 0) + (row._sum.balanceCents ?? 0));
  }

  const merged = new Map<string, { phone: string; firstVisit: Date; lastVisit: Date; totalSpentCents: number; balanceCents: number }>();
  for (const row of spends) {
    const phone = normalizeCustomerPhone(row.phone);
    if (!phone || !row._min.createdAt || !row._max.createdAt) continue;
    const current = merged.get(phone);
    merged.set(phone, current ? {
      ...current,
      firstVisit: current.firstVisit < row._min.createdAt ? current.firstVisit : row._min.createdAt,
      lastVisit: current.lastVisit > row._max.createdAt ? current.lastVisit : row._max.createdAt,
      totalSpentCents: current.totalSpentCents + (row._sum.amountCents ?? 0),
    } : {
      phone,
      firstVisit: row._min.createdAt,
      lastVisit: row._max.createdAt,
      totalSpentCents: row._sum.amountCents ?? 0,
      balanceCents: balanceByPhone.get(phone) ?? 0,
    });
  }
  return [...merged.values()];
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
