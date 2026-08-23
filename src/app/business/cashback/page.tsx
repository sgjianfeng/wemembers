import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CashbackSetupClient } from "./CashbackSetupClient";

/** 活动 2 配置页（仅企业主；middleware 已拦店员） */
export default async function CashbackSetupPage() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    redirect("/auth/login");
  }
  return <CashbackSetupClient />;
}
