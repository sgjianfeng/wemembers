/**
 * 把「国庆活动」的数据形态迁到通用「满赠」。
 *
 * 国庆不再作为一种独立活动类型存在，它只是满赠的一组默认值。代码里的标识符、
 * 路由、文案都已改完，这个脚本负责库里的存量：
 *
 *   Campaign.tags           ndp/national-day/国庆/category:ndp/slot:ndp_gift → category:spend_get 等
 *   Campaign.rulesSnapshot  { ndp: {...} } → { spendGet: {...} }
 *   Campaign.slug           ndp-xxxx-2026 → spend-get-xxxx（旧 slug 由 /ndp/[slug] 永久跳转兜底）
 *   Campaign.name           含「国庆」→ 换成「满赠」
 *   Coupon.title/description 含「国庆」的赠券模版 → 「满赠」
 *   Voucher.issueReason     ndp_draw_entry → spend_get_draw_entry
 *   PhysicalBatch.visualTemplateId  festival_ndp → festival_red
 *
 * 读取侧对旧值仍然兼容（parseSpendGetRules 认 ndp 键，isSpendGetCampaign 认旧 tag），
 * 所以这个脚本不是上线前置条件，但跑完之后那些兼容分支才能删。
 *
 *   npx tsx scripts/migrate-ndp-to-spend-get.ts [--apply]
 */
import { prisma } from "../src/lib/db";

const LEGACY_TAGS = new Set(["ndp", "national-day", "国庆"]);

function migrateTags(raw: string | null): string | null {
  if (!raw) return null;
  let tags: string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    tags = parsed.map(String);
  } catch {
    return null;
  }
  const next: string[] = [];
  for (const t of tags) {
    if (LEGACY_TAGS.has(t)) {
      if (!next.includes("spend_get")) next.push("spend_get");
      continue;
    }
    if (t === "category:ndp") {
      if (!next.includes("category:spend_get")) next.push("category:spend_get");
      continue;
    }
    if (t === "slot:ndp_gift") {
      if (!next.includes("slot:spend_get")) next.push("slot:spend_get");
      continue;
    }
    if (!next.includes(t)) next.push(t);
  }
  const out = JSON.stringify(next);
  return out === raw ? null : out;
}

function migrateRules(raw: string | null): string | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!obj.ndp || typeof obj.ndp !== "object") return null;
  const { ndp, ...rest } = obj;
  return JSON.stringify({ ...rest, spendGet: ndp });
}

function migrateName(name: string): string | null {
  if (!/国庆|National Day/i.test(name)) return null;
  const next = name
    .replace(/国庆满赠/g, "满赠")
    .replace(/国庆/g, "满赠")
    .replace(/National Day/gi, "Spend & get")
    .replace(/满赠\s*·\s*满赠/g, "满赠")
    .trim();
  return next === name ? null : next;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const log = (s: string) => console.log(s);

  const campaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        { tags: { contains: "ndp" } },
        { tags: { contains: "国庆" } },
        { tags: { contains: "national-day" } },
        { rulesSnapshot: { contains: '"ndp"' } },
        { name: { contains: "国庆" } },
        { slug: { startsWith: "ndp-" } },
      ],
    },
    select: { id: true, name: true, slug: true, tags: true, rulesSnapshot: true, businessId: true },
  });

  log(`活动 ${campaigns.length} 个待检查`);
  let touched = 0;
  for (const c of campaigns) {
    const data: Record<string, string> = {};
    const tags = migrateTags(c.tags);
    if (tags) data.tags = tags;
    const rules = migrateRules(c.rulesSnapshot);
    if (rules) data.rulesSnapshot = rules;
    const name = migrateName(c.name);
    if (name) data.name = name;
    if (c.slug?.startsWith("ndp-")) {
      const candidate = `spend-get-${c.businessId.slice(-6)}`;
      const taken = await prisma.campaign.findFirst({
        where: { slug: candidate, id: { not: c.id } },
        select: { id: true },
      });
      if (!taken) data.slug = candidate;
    }
    if (Object.keys(data).length === 0) continue;
    touched++;
    log(`  ${c.name}`);
    for (const [k, v] of Object.entries(data)) {
      log(`    ${k}: ${String(v).slice(0, 100)}`);
    }
    if (apply) await prisma.campaign.update({ where: { id: c.id }, data });
  }
  log(`活动需改 ${touched} 个`);

  // 赠券模版的标题/说明（发放时按模版拷给顾客，不改会一直显示「国庆赠送券」）
  const coupons = await prisma.coupon.findMany({
    where: {
      OR: [{ title: { contains: "国庆" } }, { description: { contains: "国庆" } }],
    },
    select: { id: true, title: true, description: true },
  });
  log(`赠券模版 ${coupons.length} 个含「国庆」`);
  for (const c of coupons) {
    const title = c.title.replace(/国庆满赠/g, "满赠").replace(/国庆/g, "");
    const description = (c.description || "").replace(/国庆满赠/g, "满赠").replace(/国庆/g, "");
    log(`  「${c.title}」→「${title.trim()}」`);
    if (apply) {
      await prisma.coupon.update({
        where: { id: c.id },
        data: {
          title: title.trim() || c.title,
          ...(c.description ? { description: description.trim() } : {}),
        },
      });
    }
  }

  const vouchers = await prisma.voucher.count({ where: { issueReason: "ndp_draw_entry" } });
  log(`Voucher.issueReason=ndp_draw_entry: ${vouchers}`);
  if (apply && vouchers > 0) {
    await prisma.voucher.updateMany({
      where: { issueReason: "ndp_draw_entry" },
      data: { issueReason: "spend_get_draw_entry" },
    });
  }

  const batches = await prisma.physicalBatch.count({ where: { visualTemplateId: "festival_ndp" } });
  log(`PhysicalBatch.visualTemplateId=festival_ndp: ${batches}`);
  if (apply && batches > 0) {
    await prisma.physicalBatch.updateMany({
      where: { visualTemplateId: "festival_ndp" },
      data: { visualTemplateId: "festival_red" },
    });
  }

  if (!apply) log("\n（预演，未写入。加 --apply 执行）");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
