"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface JoinButtonProps {
  campaignId: string;
  label: string;
}

export function JoinButton({ campaignId, label }: JoinButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleJoin() {
    setLoading(true);
    try {
      const res = await fetch(`/api/business/campaigns/${campaignId}/join`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json();
        alert(d.error || "Join failed");
      }
    } catch {
      alert("Network error — please try again");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleJoin}
      disabled={loading}
      className="px-4 py-1.5 bg-[#1A6EFF] text-white rounded-full text-xs font-medium disabled:opacity-50"
    >
      {loading ? "..." : label}
    </button>
  );
}
