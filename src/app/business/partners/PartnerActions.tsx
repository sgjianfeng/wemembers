"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnerActions({ partnershipId, canRevoke }: { partnershipId: string; canRevoke?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState("");

  async function act(action: string) {
    setLoading(action);
    await fetch(`/api/business/partners/${partnershipId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading("");
    router.refresh();
  }

  return (
    <div className="flex gap-1.5 mt-2">
      {!canRevoke && (
        <>
          <button
            onClick={() => act("approve")}
            disabled={loading !== ""}
            className="flex-1 h-7 text-xs font-medium text-white bg-green-500 rounded-full disabled:opacity-50 active:scale-[0.97] transition-transform"
          >
            {loading === "approve" ? "..." : "接受"}
          </button>
          <button
            onClick={() => act("reject")}
            disabled={loading !== ""}
            className="flex-1 h-7 text-xs font-medium text-muted-foreground bg-muted rounded-full disabled:opacity-50 active:scale-[0.97] transition-transform"
          >
            {loading === "reject" ? "..." : "拒绝"}
          </button>
        </>
      )}
      {canRevoke && (
        <button
          onClick={() => { if (confirm("确定撤销合作？")) act("revoke"); }}
          disabled={loading !== ""}
          className="h-7 px-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-full disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          {loading === "revoke" ? "..." : "撤销合作"}
        </button>
      )}
    </div>
  );
}
