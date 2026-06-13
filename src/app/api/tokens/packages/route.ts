import { NextResponse } from "next/server";
import { TOKEN_PACKAGES, TOKEN_COSTS } from "@/types";

export async function GET() {
  return NextResponse.json({
    data: {
      packages: TOKEN_PACKAGES,
      costs: TOKEN_COSTS,
    },
  });
}
