// GET /api/campaign/active-activities — public joinable activities (no product_mirror)

import { NextResponse } from "next/server";
import { listJoinableActivities } from "@/lib/discover-activities";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    const customerId =
      session?.role === "customer" ? session.userId : null;
    const data = await listJoinableActivities({
      limit: 40,
      customerId,
      // 首页：国庆满赠 + 大奖倒计时（长期券只在门店页）
      listScope: "hot",
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("active-activities error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}
