"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

interface TierConfig {
  id: string;
  tier: string;
  name: string;
  pointsRequired: number;
  color: string;
  benefits: string;
}

export function TierConfigForm({
  configs: initialConfigs,
  tierIcons,
}: {
  configs: TierConfig[];
  tierIcons: Record<string, string>;
}) {
  const router = useRouter();
  const [configs, setConfigs] = useState<TierConfig[]>(initialConfigs);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function updateConfig<I extends keyof TierConfig>(
    index: number,
    field: I,
    value: TierConfig[I]
  ) {
    const next = [...configs];
    next[index][field] = value;
    setConfigs(next);
  }

  function updateBenefit(index: number, benefitText: string) {
    const next = [...configs];
    next[index].benefits = benefitText;
    setConfigs(next);
  }

  async function handleSave() {
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/business/members/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMessage("✅ 保存成功");
      router.refresh();
    } else {
      setMessage(`❌ ${data.error || "保存失败"}`);
    }
  }

  const colorOptions = [
    "#94A3B8", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444", "#10B981",
  ];

  return (
    <div className="space-y-4">
      {configs.map((cfg, i) => (
        <Card key={cfg.tier}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{tierIcons[cfg.tier] || "⭐"}</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {cfg.name}
                </p>
                <p className="text-[10px] text-slate-400 uppercase">
                  {cfg.tier}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                label="等级名称"
                value={cfg.name}
                onChange={(e) => updateConfig(i, "name", e.target.value)}
              />
              <Input
                label="升级所需积分"
                type="number"
                value={cfg.pointsRequired}
                onChange={(e) =>
                  updateConfig(i, "pointsRequired", Number(e.target.value))
                }
                prefix="⭐"
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  标签颜色
                </label>
                <div className="flex gap-1.5">
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateConfig(i, "color", c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        cfg.color === c
                          ? "border-slate-900 scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  会员权益（一行一个）
                </label>
                <textarea
                  value={
                    (() => {
                      try {
                        const parsed = JSON.parse(cfg.benefits);
                        return Array.isArray(parsed)
                          ? parsed.join("\n")
                          : cfg.benefits;
                      } catch {
                        return cfg.benefits || "";
                      }
                    })()
                  }
                  onChange={(e) => {
                    const lines = e.target.value
                      .split("\n")
                      .filter((l) => l.trim());
                    updateBenefit(i, JSON.stringify(lines));
                  }}
                  placeholder="9折优惠&#10;生日专属礼品&#10;优先核销通道"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A6EFF] resize-none"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {message && (
        <div
          className={`text-center text-sm p-3 rounded-xl ${
            message.startsWith("✅")
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleSave}
        loading={loading}
      >
        保存配置
      </Button>
    </div>
  );
}
