import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { callAi } from "@/services/ai/client";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { query } = await request.json();
  if (!query) return NextResponse.json({ error: "请输入搜索内容" }, { status: 400 });

  const result = await callAi<{ keywords: string[]; category?: string; maxPrice?: number; sortBy?: string; explanation: string }>(
    "你是搜索解析专家。将用户自然语言搜索转为结构化过滤条件。输出JSON。",
    `用户搜索: "${query}"
可过滤条件: { keywords: string[], category?: "cafe"|"food"|"retail"|"beauty"|"fitness", maxPrice?: number, sortBy?: "value"|"popularity"|"expiry", explanation: string }

示例: "找20块以内的咖啡券" → { "keywords":["咖啡"], "category":"cafe", "maxPrice":2000, "sortBy":"value", "explanation":"筛选咖啡类券，面值≤S$20" }`,
    { temperature: 0.2, maxTokens: 200 }
  );

  if (!result.success) {
    return NextResponse.json({ data: { keywords: [query], explanation: "简单搜索" }, fallback: true });
  }

  return NextResponse.json({ data: result.data, meta: { cached: result.cached } });
}
