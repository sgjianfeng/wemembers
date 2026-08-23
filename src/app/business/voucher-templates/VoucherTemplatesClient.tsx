"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";

/** 储值券：有余额，可分次核销（Voucher 模型） */
/** 权益券：一次性核销（Coupon 模型） */
type Family = "stored" | "entitlement";

type Template = {
  id: string;
  family: Family;
  icon: string;
  name: string;
  desc: string;
  /** 权益券走既有创建向导 */
  href?: string;
  /** 储值券在本页内联创建 */
  packKind?: string;
};

const TEMPLATES: Template[] = [
  {
    id: "discount_voucher",
    family: "stored",
    icon: "💳",
    name: "折扣券",
    desc: "折扣率可调：0% = 原价代金，10% = 9折卡，20% = 8折卡",
    packKind: "discount_voucher",
  },
  {
    id: "face_threshold",
    family: "stored",
    icon: "🎯",
    name: "门槛储值券",
    desc: "折扣券 + 单次最低消费门槛（券面 × 倍数）",
    packKind: "discount_voucher",
  },
  {
    id: "exclusive_ballot",
    family: "stored",
    icon: "🎰",
    name: "抽奖券",
    desc: "购券时扣 15% 进真金奖池 · 可兑实物大奖 · 属于「大奖倒计时」活动",
    packKind: "exclusive_ballot",
  },
  {
    id: "fixed_amount",
    family: "entitlement",
    icon: "💰",
    name: "满减券",
    desc: "满 S$100 减 S$20 · 一次性核销",
    href: "/business/coupons/new?type=fixed_amount",
  },
  {
    id: "percentage",
    family: "entitlement",
    icon: "🏷️",
    name: "折扣权益券",
    desc: "按百分比减免，如 8 折 · 一次性核销",
    href: "/business/coupons/new?type=percentage",
  },
  {
    id: "free_item",
    family: "entitlement",
    icon: "🎁",
    name: "赠品券",
    desc: "免费赠送指定商品/服务 · 一次性核销",
    href: "/business/coupons/new?type=free_item",
  },
];

const TIER_PRESETS = [2, 5, 10, 20, 50, 100, 200, 500];

export function VoucherTemplatesClient() {
  const router = useRouter();
  const [picked, setPicked] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [discountPercent, setDiscountPercent] = useState(10);
  const [tiers, setTiers] = useState<number[]>([10, 20, 50, 100, 200]);
  const [validDays, setValidDays] = useState(0);
  const [minSpendMultiplier, setMinSpendMultiplier] = useState(10);
  const [saving, setSaving] = useState(false);

  function pick(t: Template) {
    if (t.href) {
      router.push(t.href);
      return;
    }
    setPicked(t);
    setName(t.name);
    if (t.id === "exclusive_ballot") setTiers([50, 100]);
    else setTiers([10, 20, 50, 100, 200]);
  }

  async function create(status: "draft" | "active") {
    if (!picked) return;
    if (!name.trim()) return toast.error("请填写名称");
    if (tiers.length === 0) return toast.error("请至少选一个面额");
    setSaving(true);
    try {
      const res = await fetch("/api/business/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          packKind: picked.packKind,
          enabledTiers: tiers,
          status,
          ...(picked.packKind === "discount_voucher"
            ? {
                discountPercent,
                validDays: validDays > 0 ? validDays : null,
                minSpendMultiplier:
                  picked.id === "face_threshold" ? minSpendMultiplier : 0,
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "创建失败");
      toast.success(status === "active" ? "已创建并上架" : "已存为草稿");
      router.push("/business/products");
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (picked) {
    const isDiscount = picked.packKind === "discount_voucher";
    const isThreshold = picked.id === "face_threshold";
    return (
      <div className="p-4 space-y-4 pb-24">
        <button
          className="text-sm text-muted-foreground"
          onClick={() => setPicked(null)}
        >
          ← 换个模版
        </button>

        <div>
          <h1 className="text-lg font-bold">
            {picked.icon} {picked.name}
          </h1>
          <p className="text-xs text-muted-foreground">{picked.desc}</p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">名称</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            {isDiscount && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">折扣率</span>
                  <span className="font-bold">{discountPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {discountPercent === 0
                    ? "原价代金：付 S$100 得 S$100 余额"
                    : `付 S$${100 - discountPercent} 得 S$100 余额`}
                </p>
              </div>
            )}

            {isThreshold && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  最低消费倍数（券面 × N）
                </label>
                <Input
                  type="number"
                  value={minSpendMultiplier}
                  onChange={(e) =>
                    setMinSpendMultiplier(Math.max(0, Number(e.target.value)))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  例：S$10 券 × {minSpendMultiplier} = 单次消费满 S$
                  {10 * minSpendMultiplier} 才可用
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">面额档位 (S$)</label>
              <div className="flex flex-wrap gap-2">
                {TIER_PRESETS.map((v) => {
                  const on = tiers.includes(v);
                  return (
                    <Button
                      key={v}
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() =>
                        setTiers(
                          on
                            ? tiers.filter((x) => x !== v)
                            : [...tiers, v].sort((a, b) => a - b)
                        )
                      }
                    >
                      {v}
                    </Button>
                  );
                })}
              </div>
            </div>

            {isDiscount && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">有效期</label>
                <div className="flex gap-2 flex-wrap">
                  {[0, 30, 90, 180, 365].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={validDays === d ? "default" : "outline"}
                      onClick={() => setValidDays(d)}
                    >
                      {d === 0 ? "跟随活动" : `${d} 天`}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {validDays === 0
                    ? "以活动截止日为准"
                    : `顾客购买后 ${validDays} 天内有效`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => create("draft")}
            disabled={saving}
          >
            存草稿
          </Button>
          <Button
            className="flex-1"
            onClick={() => create("active")}
            disabled={saving}
          >
            创建并上架
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-24">
      <div>
        <h1 className="text-lg font-bold">新建券</h1>
        <p className="text-xs text-muted-foreground">
          选一个模版开始
        </p>
      </div>

      <Section
        title="储值券"
        hint="有余额，可分次核销"
        items={TEMPLATES.filter((t) => t.family === "stored")}
        onPick={pick}
      />
      <Section
        title="权益券"
        hint="一次性核销"
        items={TEMPLATES.filter((t) => t.family === "entitlement")}
        onPick={pick}
      />

      <Card className="bg-muted/50 border-dashed">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium">系统自动发放</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium">消费抵扣额度</span> —— 由「消费返 +
              抽奖」活动按比例自动计提
            </p>
            <p>
              <span className="font-medium">中奖奖励券</span> ——
              顾客中奖时自动发放
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            这两种券不能手动创建，只能在活动里调整规则。
          </p>
          <Link href="/business/cashback">
            <Button variant="outline" size="sm" className="mt-1">
              去配置活动规则
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  onPick,
}: {
  title: string;
  hint: string;
  items: Template[];
  onPick: (t: Template) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {items.map((t) => (
        <Card
          key={t.id}
          className="cursor-pointer active:scale-[0.99] transition"
          onClick={() => onPick(t)}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <span className="text-2xl">{t.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{t.name}</p>
                {t.id === "exclusive_ballot" && (
                  <Badge variant="secondary" className="text-[10px]">
                    真金奖池
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
