import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * 运营 Token 页已下线。
 * - 商家现金钱包 → /business/tokens
 * - 顾客券余额 → /balance
 */
export default async function MyTokensPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role === "business" || session.role === "staff") {
    redirect("/business/tokens");
  }
  redirect("/balance");
}
