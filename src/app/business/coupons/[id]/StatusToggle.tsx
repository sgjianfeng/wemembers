"use client";

import { useRouter } from "next/navigation";

export function StatusToggle({ couponId, currentStatus }: { couponId: string; currentStatus: string }) {
  const router = useRouter();
  const newStatus = currentStatus === "published" ? "paused" : "published";

  async function toggle() {
    await fetch(`/api/business/coupons/${couponId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-full border border-slate-200 text-slate-900 bg-white hover:bg-slate-50"
    >
      {currentStatus === "published" ? "⏸️ 暂停" : "▶️ 恢复"}
    </button>
  );
}
