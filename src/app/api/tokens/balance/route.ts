import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTokenBalance } from "@/lib/tokens";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const balance = await getTokenBalance(session.userId);
  return NextResponse.json({ data: { balance } });
}
