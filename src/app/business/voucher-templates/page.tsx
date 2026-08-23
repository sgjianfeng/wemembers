import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VoucherTemplatesClient } from "./VoucherTemplatesClient";

/**
 * 券模版索引（活动 1 的货架入口）
 *
 * 按三层分类法呈现：商家可主动创建 6 个模版；
 * 抵扣额度（cashback）与奖励券（prize）由系统按活动规则发放，
 * **刻意不出现在本页** —— 手动创建等于绕过计提逻辑。
 */
export default async function VoucherTemplatesPage() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    redirect("/auth/login");
  }
  return <VoucherTemplatesClient />;
}
