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
      limit: 20,
      customerId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("active-activities error:", error);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}
