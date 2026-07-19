"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";

import { AiGenerateButton } from "./AiGenerateButton";

type CouponType = "fixed_amount" | "percentage" | "free_item";
type Step = 1 | 2 | 3;

const types: { value: CouponType; icon: string; label: string; desc: string }[] = [
  { value: "percentage", icon: "🏷️", label: "折扣券", desc: "按百分比减免，如 8折" },
  { value: "fixed_amount", icon: "💰", label: "定额减免", desc: "固定金额，如 S$15代金券" },
  { value: "free_item", icon: "🎁", label: "免单券", desc: "免费赠送指定商品/服务" },
];

export default function CreateCouponPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [couponType, setCouponType] = useState<CouponType>("fixed_amount");
  const [title, setTitle] = useState("");
  const [valueCents, setValueCents] = useState(1500);
  const [pointsRequired, setPointsRequired] = useState(120);

  // Step 2
  const [minSpend, setMinSpend] = useState(0);
  const [validDays, setValidDays] = useState(30);
  const [quantity, setQuantity] = useState(500);
  const [unlimited, setUnlimited] = useState(false);
  const [perCustomer, setPerCustomer] = useState(1);
  const [isGiftable, setIsGiftable] = useState(true);

  // 推广设置
  const [allowPromotion, setAllowPromotion] = useState(false);
  const [rewardType, setRewardType] = useState<"cash" | "item" | "lottery">("cash");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState(20);
  const [itemRewardName, setItemRewardName] = useState("");
  const [itemRewardQty, setItemRewardQty] = useState(0); // 0=不限
  const [allowBulk, setAllowBulk] = useState(false);
  const [bulkDiscount, setBulkDiscount] = useState(85);

  // 领券赠品
  const [giftType, setGiftType] = useState<"none" | "item" | "lottery" | "points">("none");
  const [giftItemName, setGiftItemName] = useState("");
  const [giftItemIcon, setGiftItemIcon] = useState("🎁");
  const [giftPoints, setGiftPoints] = useState(50);
  const [giftLotteryPrizes, setGiftLotteryPrizes] = useState([{ name: "免单", icon: "🎉", weight: 5 }, { name: "小礼品", icon: "🎁", weight: 20 }, { name: "5元券", icon: "🎫", weight: 30 }, { name: "50积分", icon: "⭐", weight: 45 }]);

  // 所属活动
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/business/campaigns?status=active")
      .then(r => r.json()).then(d => setCampaigns(d.data || []));
  }, []);

  const typeDisplay: Record<CouponType, string> = { fixed_amount: `S$${(valueCents / 100).toFixed(0)}`, percentage: `${(valueCents / 100).toFixed(0)}折`, free_item: "免单" };

  const previewCoupon = {
    title: title || "代金券标题",
    type: couponType,
    display: typeDisplay[couponType],
    pointsRequired,
    validDays,
  };

  async function handleCreate() {
    if (!title) { setError("请输入券标题"); return; }
    setLoading(true); setError("");

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const res = await fetch("/api/business/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, type: couponType, valueCents,
        pointsRequired, minSpendCents: minSpend * 100,
        totalQuantity: unlimited ? null : quantity,
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
        isGiftable, perCustomerLimit: perCustomer,
        status: "published",
        campaignId: campaignId || null,
        allowPromotion,
        rewardType,
        ...(allowPromotion ? { rewardType, commissionType, commissionValue, allowBulkPurchase: allowBulk, bulkDiscount: allowBulk ? bulkDiscount : null,
          itemRewardName: rewardType === "item" ? itemRewardName : null,
          itemRewardQuantity: rewardType === "item" && itemRewardQty > 0 ? itemRewardQty : null,
        } : {}),
        giftType,
        giftData: giftType !== "none" ? (giftType === "points" ? JSON.stringify({ points: giftPoints }) : giftType === "item" ? JSON.stringify({ name: giftItemName, icon: giftItemIcon }) : JSON.stringify({ prizes: giftLotteryPrizes })) : null,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push(`/business/coupons/${data.data.id}`);
    } else {
      setError(data.error || "创建失败");
    }
  }

  return (
    <div className="pb-4 min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <button onClick={() => step > 1 ? setStep((step - 1) as Step) : router.back()} className="text-sm text-slate-500">← 返回</button>
        <div className="flex items-center gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-2 h-2 rounded-full ${s <= step ? "bg-[#1A6EFF]" : "bg-slate-200"}`} />
          ))}
        </div>
        <span className="text-xs text-slate-400">免费创建</span>
      </div>

      <div className="flex-1 px-4 overflow-auto">
        {/* Step 1: Type + Amount */}
        {step === 1 && (
          <div className="mt-4">
            {/* AI 快速生成 */}
            <AiGenerateButton
              onFill={(data: { title: string; type: CouponType; valueCents: number; pointsRequired: number; validDays: number; description: string }) => {
                setTitle(data.title);
                setCouponType(data.type);
                setValueCents(data.valueCents);
                setPointsRequired(data.pointsRequired);
                setValidDays(data.validDays);
                setStep(2);
              }}
            />

            {/* 活动选择器 */}
            {campaigns.length > 0 && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">📅 所属活动 (可选)</label>
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A6EFF]">
                  <option value="">不关联活动</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <h2 className="text-lg font-semibold text-slate-900 mb-1 mt-4">选择券类型</h2>
            <p className="text-xs text-slate-400 mb-4">选择最适合的代金券形式</p>

            <div className="space-y-2">
              {types.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setCouponType(t.value)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    couponType === t.value ? "border-[#1A6EFF] bg-blue-50" : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.label}</p>
                      <p className="text-xs text-slate-500">{t.desc}</p>
                    </div>
                    {couponType === t.value && <span className="ml-auto text-[#1A6EFF] text-lg">✓</span>}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              <Input label="券标题" placeholder="如: 15元美式咖啡代金券" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input
                label={couponType === "percentage" ? "折扣 (折)" : couponType === "fixed_amount" ? "面值 (分)" : "商品/服务名"}
                type="number"
                value={valueCents}
                onChange={(e) => setValueCents(Number(e.target.value))}
                prefix={couponType === "percentage" ? "" : "S$"}
              />
              <Input label="所需积分" type="number" value={pointsRequired} onChange={(e) => setPointsRequired(Number(e.target.value))} prefix="⭐" />
            </div>
          </div>
        )}

        {/* Step 2: Rules */}
        {step === 2 && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">设置规则</h2>
            <p className="text-xs text-slate-400 mb-4">定义使用条件和限制</p>

            <div className="space-y-3">
              <Input label="最低消费 (元，0=无)" type="number" value={minSpend} onChange={(e) => setMinSpend(Number(e.target.value))} prefix="S$" />
              <Input label="有效期 (天)" type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">发放数量</label>
                <div className="flex gap-2">
                  <button onClick={() => setUnlimited(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${!unlimited ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-500"}`}>限量</button>
                  <button onClick={() => setUnlimited(true)} className={`flex-1 py-2 rounded-lg text-sm font-medium ${unlimited ? "bg-[#1A6EFF] text-white" : "bg-slate-100 text-slate-500"}`}>不限量</button>
                </div>
                {!unlimited && (
                  <Input className="mt-2" type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                )}
              </div>

              <Input label="每人限领" type="number" value={perCustomer} onChange={(e) => setPerCustomer(Number(e.target.value))} />

              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">允许转赠</span>
                <button onClick={() => setIsGiftable(!isGiftable)} className={`w-12 h-6 rounded-full transition-colors ${isGiftable ? "bg-[#1A6EFF]" : "bg-slate-200"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isGiftable ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* 推广分销设置 */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-slate-700">💸 允许推广分销</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">客户分享此券赚佣金，商家按效果付费</p>
                  </div>
                  <button onClick={() => setAllowPromotion(!allowPromotion)} className={`w-12 h-6 rounded-full transition-colors ${allowPromotion ? "bg-green-500" : "bg-slate-200"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${allowPromotion ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {allowPromotion && (
                  <div className="mt-3 space-y-3 p-3 bg-green-50 rounded-xl">
                    {/* 奖励类型选择 */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 mb-1 block">推广奖励类型</label>
                      <div className="flex gap-1.5">
                        {([
                          { key: "cash", icon: "💰", label: "现金佣金" },
                          { key: "item", icon: "🎁", label: "实物奖励" },
                          { key: "lottery", icon: "🎰", label: "幸运抽奖" },
                        ] as const).map((t) => (
                          <button key={t.key} onClick={() => setRewardType(t.key)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${rewardType === t.key ? "bg-green-500 text-white" : "bg-white text-slate-500"}`}>
                            {t.icon} {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 现金佣金 */}
                    {rewardType === "cash" && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-slate-700 mb-1 block">佣金方式</label>
                          <div className="flex gap-2">
                            <button onClick={() => setCommissionType("percentage")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${commissionType === "percentage" ? "bg-green-500 text-white" : "bg-white text-slate-500"}`}>按比例</button>
                            <button onClick={() => setCommissionType("fixed")} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${commissionType === "fixed" ? "bg-green-500 text-white" : "bg-white text-slate-500"}`}>固定金额</button>
                          </div>
                        </div>
                        <Input label={commissionType === "percentage" ? "佣金比例 (%)" : "固定佣金 (分)"} type="number" value={commissionValue} onChange={(e) => setCommissionValue(Number(e.target.value))} prefix={commissionType === "percentage" ? "%" : "S$"} />
                        <p className="text-[10px] text-green-700">
                          {commissionType === "percentage" ? `每核销一张，推广者得券面值的 ${commissionValue}%（平台抽20%）` : `每核销一张，推广者得 S$${(commissionValue / 100).toFixed(2)}（平台抽20%）`}
                        </p>
                      </>
                    )}

                    {/* 实物奖励 */}
                    {rewardType === "item" && (
                      <>
                        <Input label="奖品名称" placeholder="如：招牌奶茶一杯" value={itemRewardName} onChange={(e) => setItemRewardName(e.target.value)} />
                        <Input label="奖品库存 (0=不限)" type="number" value={itemRewardQty} onChange={(e) => setItemRewardQty(Number(e.target.value))} />
                        <p className="text-[10px] text-green-700">
                          推广者每成功推广核销一张券，即可获得「{itemRewardName || "奖品"}」
                        </p>
                      </>
                    )}

                    {/* 幸运抽奖 */}
                    {rewardType === "lottery" && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-700 mb-2">🎰 抽奖说明</p>
                        <ul className="text-[10px] text-slate-500 space-y-1">
                          <li>• 推广者每成功推广核销一张，获得1次抽奖机会</li>
                          <li>• 中奖概率由商家设置的奖池权重决定</li>
                          <li>• 发布券后可在券详情页设置奖池</li>
                        </ul>
                      </div>
                    )}

                    {/* 囤货 (仅现金类) */}
                    {rewardType === "cash" && (
                      <>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-xs text-slate-600">允许推广者囤货</span>
                          <button onClick={() => setAllowBulk(!allowBulk)} className={`w-10 h-5 rounded-full transition-colors ${allowBulk ? "bg-green-500" : "bg-slate-200"}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${allowBulk ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </div>
                        {allowBulk && <Input label="囤货折扣 (折)" type="number" value={bulkDiscount} onChange={(e) => setBulkDiscount(Number(e.target.value))} prefix="折" />}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 领券赠品设置 */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-slate-700">🎀 领券赠好礼</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">顾客领取此券时额外获得赠品，提升领取率</p>
                  </div>
                  <button onClick={() => setGiftType(giftType === "none" ? "points" : "none")} className={`w-12 h-6 rounded-full transition-colors ${giftType !== "none" ? "bg-pink-500" : "bg-slate-200"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${giftType !== "none" ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {giftType !== "none" && (
                  <div className="mt-1 space-y-3 p-3 bg-pink-50 rounded-xl">
                    <div>
                      <label className="text-xs font-medium text-slate-700 mb-1 block">赠品类型</label>
                      <div className="flex gap-1.5">
                        {([
                          { key: "points", icon: "⭐", label: "积分" },
                          { key: "item", icon: "🎁", label: "实物" },
                          { key: "lottery", icon: "🎰", label: "抽奖" },
                        ] as const).map((t) => (
                          <button key={t.key} onClick={() => setGiftType(t.key)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${giftType === t.key ? "bg-pink-500 text-white" : "bg-white text-slate-500"}`}>
                            {t.icon} {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {giftType === "points" && (
                      <>
                        <Input label="赠送积分" type="number" value={giftPoints} onChange={(e) => setGiftPoints(Number(e.target.value))} prefix="⭐" />
                        <p className="text-[10px] text-pink-700">顾客领取此券时额外获得 {giftPoints} 积分</p>
                      </>
                    )}

                    {giftType === "item" && (
                      <div className="flex gap-2">
                        <div className="flex-1"><Input label="赠品名" placeholder="如：手工小饼干" value={giftItemName} onChange={(e) => setGiftItemName(e.target.value)} /></div>
                        <div className="w-20"><Input label="图标" value={giftItemIcon} onChange={(e) => setGiftItemIcon(e.target.value)} /></div>
                      </div>
                    )}

                    {giftType === "lottery" && (
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-700 mb-2">🎰 奖池配置</p>
                        {giftLotteryPrizes.map((prize, i) => (
                          <div key={i} className="flex items-center gap-2 mb-1.5 text-xs">
                            <span>{prize.icon}</span>
                            <span className="flex-1 text-slate-600">{prize.name}</span>
                            <span className="text-slate-400">权重</span>
                            <input type="number" value={prize.weight} onChange={(e) => { const p = [...giftLotteryPrizes]; p[i].weight = Number(e.target.value); setGiftLotteryPrizes(p); }} className="w-12 h-6 px-1 rounded border border-slate-200 text-center text-xs" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">确认发布</h2>
            <p className="text-xs text-slate-400 mb-4">预览券在客户端的展示效果</p>

            {/* Preview Card */}
            <Card className="border-l-4 border-l-[#FF6B35]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">预览效果</p>
                  <span className="text-[10px] text-slate-300">客户视角</span>
                </div>
                <div className="border-t border-dashed border-slate-100 pt-3">
                  <p className="text-3xl font-bold text-[#FF6B35]">{previewCoupon.display}</p>
                  <p className="text-sm font-medium text-slate-900 mt-1">{previewCoupon.title}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500">{previewCoupon.pointsRequired}⭐ 可领取</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{validDays}天有效期</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-dashed border-slate-100 flex gap-2">
                    <span className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">立即领取</span>
                    {isGiftable && <span className="px-3 py-1.5 bg-slate-100 text-slate-500 text-xs rounded-full">🎁 转赠</span>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gift Preview */}
            {giftType !== "none" && (
              <div className="mt-3">
                {giftType === "points" ? (
                  <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <p className="text-sm font-semibold text-amber-700">领取即送积分</p>
                        <p className="text-xs text-amber-600">额外获得 +{giftPoints} 积分</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : giftType === "item" ? (
                  <Card className="border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-2xl">{giftItemIcon || "🎁"}</span>
                      <div>
                        <p className="text-sm font-semibold text-pink-700">领券赠好礼</p>
                        <p className="text-xs text-pink-600">额外获得「{giftItemName || "惊喜礼品"}」</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : giftType === "lottery" ? (
                  <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🎰</span>
                        <div>
                          <p className="text-sm font-semibold text-purple-700">领券抽大奖</p>
                          <p className="text-xs text-purple-600">每领一张券即可抽奖一次</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {giftLotteryPrizes.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full">{p.icon} {p.name}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}

            {/* Summary */}
            <div className="mt-4 bg-slate-50 rounded-xl p-4 space-y-2">
              {[
                { label: "券类型", value: types.find(t => t.value === couponType)?.label },
                { label: "券标题", value: title || "(未填写)" },
                { label: "面值", value: typeDisplay[couponType] },
                { label: "所需积分", value: `${pointsRequired}⭐` },
                { label: "最低消费", value: minSpend > 0 ? `S$${minSpend}` : "无" },
                { label: "有效期", value: `${validDays}天` },
                { label: "数量", value: unlimited ? "不限量" : `${quantity}张` },
                { label: "每人限领", value: `${perCustomer}张` },
                { label: "转赠", value: isGiftable ? "允许" : "禁止" },

              ].map((item) => (
                <div key={item.label} className="flex justify-between text-xs">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-slate-900 font-medium">{item.value}</span>
                </div>
              ))}
            </div>

            {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white">
        {step < 3 ? (
          <Button className="w-full" size="lg" onClick={() => setStep((step + 1) as Step)}>
            下一步
          </Button>
        ) : (
          <Button className="w-full" size="lg" onClick={handleCreate} loading={loading}>
            🚀 立即发布
          </Button>
        )}
      </div>
    </div>
  );
}
