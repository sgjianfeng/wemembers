import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SpendGetClient } from "./SpendGetClient";

/** 满赠活动配置页（仅企业主；middleware 已拦店员） */
export default async function SpendGetPage() {
  const session = await getSession();
  if (!session || session.role !== "business") {
    redirect("/auth/login");
  }
  return <SpendGetClient />;
}
