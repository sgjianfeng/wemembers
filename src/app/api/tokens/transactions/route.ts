import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTokenTransactions } from "@/lib/tokens";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20");

  const result = await getTokenTransactions(session.userId, { type, cursor, limit });

  return NextResponse.json({
    data: result.transactions,
    meta: { hasMore: result.hasMore, cursor: result.cursor },
  });
}
