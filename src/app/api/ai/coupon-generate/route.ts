import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { callAi } from "@/services/ai/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { goal, businessCategory, businessName } = await request.json();
  if (!goal) return NextResponse.json({ error: "请描述你的目标" }, { status: 400 });

  const result = await callAi<{
    title: string; type: string; valueCents: number;
    pointsRequired: number; totalQuantity: number; validDays: number;
    description: string; reasoning: string;
  }>(
    "你是代金券优化专家。为商家生成最优代金券配置。输出严格JSON。",
    `商家: ${businessName || "我的店铺"} (${businessCategory || "零售"})
目标: "${goal}"
生成一张代金券:
{
  "title": "吸引人的中文标题(≤15字)",
  "type": "fixed_amount|percentage|free_item",
  "valueCents": 面值分(定)=1500,百分比=80(8折),免单=0,
  "pointsRequired": 所需积分(50-500),
  "totalQuantity": 发放数量(null=不限),
  "validDays": 有效天数(7-90),
  "description": "使用条款(≤80字)",
  "reasoning": "为什么这样设计(≤50字)"
}`,
    { temperature: 0.7, maxTokens: 400 }
  );

  if (!result.success || !result.data) {
    return NextResponse.json({ error: "AI生成失败", fallback: true }, { status: 500 });
  }

  return NextResponse.json({ data: result.data, meta: { cached: result.cached } });
}
