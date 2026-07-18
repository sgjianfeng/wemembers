"use client";

import { useState } from "react";

export function StripeSetupButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/account", { method: "POST" });
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSetup}
      disabled={loading}
      className="inline-block px-4 py-2 bg-[#1A6EFF] text-white text-sm rounded-full disabled:opacity-50"
    >
      {loading ? "…" : label}
    </button>
  );
}
