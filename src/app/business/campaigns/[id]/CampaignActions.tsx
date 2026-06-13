"use client";

import { useRouter } from "next/navigation";

export function CampaignActions({ campaignId, currentStatus }: { campaignId: string; currentStatus: string }) {
  const router = useRouter();

  async function toggle() {
    const newStatus = currentStatus === "draft" ? "active" : "ended";
    await fetch(`/api/business/campaigns/${campaignId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  if (currentStatus === "draft") {
    return (
      <button onClick={toggle} className="px-4 py-2 bg-green-500 text-white text-sm rounded-full">▶️ 启动活动</button>
    );
  }

  if (currentStatus === "active") {
    return (
      <button onClick={toggle} className="px-4 py-2 bg-slate-500 text-white text-sm rounded-full">⏹️ 结束活动</button>
    );
  }

  return null;
}
