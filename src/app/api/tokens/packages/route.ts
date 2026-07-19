import { NextResponse } from "next/server";

/** 运营 Token 包已下线；商户现金充值走 Stripe Checkout → /business/tokens */
export async function GET() {
  return NextResponse.json({
    data: {
      packages: [],
      costs: {},
      note: "Platform ops tokens retired. Business cash wallet uses S$ via /business/tokens.",
    },
  });
}
