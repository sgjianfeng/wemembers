"use client";

import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";

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
      <button onClick={toggle} className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-full active:scale-[0.97] transition-transform">
        <Play size={14} /> 启动活动
      </button>
    );
  }

  if (currentStatus === "active") {
    return (
      <button onClick={toggle} className="inline-flex items-center gap-1.5 px-4 py-2 bg-muted-foreground/80 text-white text-sm rounded-full active:scale-[0.97] transition-transform">
        <Square size={14} /> 结束活动
      </button>
    );
  }

  return null;
}
