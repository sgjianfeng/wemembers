import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { callAi } from "@/services/ai/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { rawNotes, couponType, couponValue, businessName, businessCategory } = await request.json();

  const result = await callAi<{ description: string }>(
    "你是文案专家。为代金券写吸引人的使用说明。用1-2个emoji。≤100字。输出JSON。",
    `券类型: ${couponType || "代金券"}
价值: ${couponValue || "优惠"}
商家: ${businessName || "店铺"} (${businessCategory || "零售"})
草稿: "${rawNotes || "优惠活动"}"

输出: { "description": "优化后的文案" }`,
    { temperature: 0.8, maxTokens: 150 }
  );

  if (!result.success) {
    return NextResponse.json({ data: { description: rawNotes }, fallback: true });
  }

  return NextResponse.json({ data: result.data, meta: { cached: result.cached } });
}
