/**
 * 回填 Membership.lifetimePoints。
 *
 * 引入该字段之前，品牌积分从来没有被扣减过（全代码库没有 points decrement），
 * 所以对历史数据而言 lifetimePoints === points 成立。
 * 必须在 db push 之后、开放领券扣积分之前跑一次，否则老会员的 lifetimePoints
 * 停在默认值 0，等级会被复算成 regular。
 *
 *   npx tsx scripts/backfill-membership-lifetime-points.ts [--apply]
 */
import { prisma } from "../src/lib/db";

async function main() {
  const apply = process.argv.includes("--apply");

  const stale = await prisma.membership.findMany({
    where: { lifetimePoints: 0, points: { gt: 0 } },
    select: { id: true, points: true, businessId: true, customerId: true },
  });

  console.log(`待回填会员: ${stale.length}`);
  if (!apply) {
    console.log("（预演，未写入。加 --apply 执行）");
    for (const m of stale.slice(0, 10)) {
      console.log(`  ${m.id}  points=${m.points} → lifetimePoints=${m.points}`);
    }
    return;
  }

  let done = 0;
  for (const m of stale) {
    await prisma.membership.update({
      where: { id: m.id },
      data: { lifetimePoints: m.points },
    });
    done++;
  }
  console.log(`已回填: ${done}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
