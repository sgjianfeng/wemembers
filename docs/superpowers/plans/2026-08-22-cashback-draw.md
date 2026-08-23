# 三活动重构：折扣券 + 余额抽奖 + 大奖倒计时

> **For agentic workers:** 步骤用 checkbox (`- [ ]`) 跟踪。实现前先读 `AGENTS.md` 与 `node_modules/next/dist/docs/`。

**Goal:** 把产品重新组织为三种活动。新增的只有活动 2（消费返余额 + 抽奖），活动 1 与活动 3 已在代码中运行，只补后台编辑页。

**核心原则（贯穿全文）：真金池只接受真金，额度池只发额度。两者之间不设兑换通道。**

---

## 1. 三种活动

| # | 活动 | 钱从哪来 | 奖品形态 | 平台费 | 现有实现 |
|---|---|---|---|---|---|
| 1 | **长期折扣券** | 顾客预付真金（付 90 得 100） | —— | 1% | `discount_10` pack + `self_use_voucher` 模版 ✅ |
| 2 | **长期余额抽奖** | **无**（商家记账负债） | 只能是额度 / 券 | 1% | **新建 `type="cashback"`** |
| 3 | **大奖倒计时** | 顾客买券真金，当场扣 15% | 可以是实物 | 2%（含在 15% 内） | `exclusive_ballot` + `exclusive_draw_15` ✅ |

### 1.1 为什么活动 2 和活动 3 不能合并

| | 活动 3 `exclusive_ballot` | 活动 2 `cashback` |
|---|---|---|
| 触发 | 顾客**买** S$100 券 | 顾客**正常消费** S$100 现金 |
| 平台是否碰钱 | 是（购券走 Stripe / 柜台收款） | **否**（现金进商家自己的收银台） |
| 扣点时点 | 付款时扣 15% | 消费后按记账计提 |
| 顾客前置动作 | 必须先掏钱买券 | 无 |
| 奖池性质 | **真金**，可采购实物大奖 | **额度**，只能发抵扣券 |

活动 3 的资金真实性来自"顾客掏真金买券"。活动 2 平台一分钱没碰，其奖池只是商家的记账负债。
**同一个奖池混两套资金逻辑会导致无法兑付的奖品承诺**——现有 `PRIZE_PACK_DEFAULT_GRAND_V1`
即时奖是代金券（额度）、大奖是 iPad/iPhone/BYD（实物），正是这个隐患，靠拆活动解决。

拆开后现有奖包无需修改：它本来就是活动 3 的奖包。

### 1.2 禁止 cashback 余额购买活动 3 的券（资金红线）

顾客用 cashback 余额买券时：顾客没掏钱、商家没收到现金，扣的 15% 是从一笔记账负债里扣的，
**池子里进的是负债的一部分，不是现金**。拿这种钱采购实物大奖买不了。

对商家也是净亏：

| | 顾客用真金买券 | 顾客用 cashback 买券 |
|---|---|---|
| 商家收到现金 | S$100 | **S$0** |
| 商家背的负债 | 消掉 | S$3 抵扣 → 变成 S$100 券 |
| 新增奖池义务 | 15%（有现金支撑） | 15%（**无现金支撑**） |

**实现：购券支付方式不接受 `origin != "purchase"` 的余额。**
活动 2 → 活动 3 的转化靠中奖体验，不靠余额铺漏斗。

---

## 1.3 三层分类法（活动 / 券 / 抽奖机会）

三者是不同层级，混在一张清单里会让实现打架。

### 第一层：活动模版（3 个）

| 活动 | 性质 | 商家在配置页做什么 |
|---|---|---|
| 1. 优惠券活动 | **券的货架** | 管理挂哪些券 |
| 2. 余额抽奖活动 | **规则引擎** | 拉两个滑块（返利% / 抽奖%） |
| 3. 大奖倒计时 | 规则引擎 + 货架 | 配抽奖券档位 + 奖品阶梯 |

活动 1 是容器、活动 2 是规则——UI 上必须区别对待，别套同一个模板。

### 第二层：券模版

代码里本来就有**两套并行的券模型**，不是一套：

| | `Voucher`（储值券） | `Coupon` / `CustomerCoupon`（权益券） |
|---|---|---|
| 有余额 | ✅ `balanceCents`，可分次核销 | ❌ 一次性核销 |
| 关键字段 | `origin`、`balanceCents`、`drawWeight` | `type: fixed_amount / percentage / free_item`、`minSpendCents` |

**商家可主动创建（6 个）**

| # | 券模版 | 模型 | 参数 | 活动 |
|---|---|---|---|---|
| 1 | **折扣券** | 储值 | **折扣率 0~50%**、面额档位、有效期 | 1 |
| 2 | **门槛储值券** | 储值 | 同上 + 单次最低消费 | 1 |
| 3 | **抽奖券** | 储值 | 面额档位、扣点 15%、抽奖权重 | 3 |
| 4 | **满减券** | 权益 | 门槛、减免额 | 1 |
| 5 | **折扣权益券** | 权益 | 门槛、折扣 % | 1 |
| 6 | **赠品券** | 权益 | 门槛、赠品名 | 1 |

**系统自动发（2 个，不进「新建券」菜单）**

| # | 券模版 | origin | 说明 |
|---|---|---|---|
| 7 | **抵扣额度** | `cashback` | 活动 2 按比例自动计提，商家只调滑块 |
| 8 | **奖励券** | `prize` | 中奖自动发，商家只配面额上限与有效期 |

7、8 商家不得手动创建，否则可绕过计提逻辑直接发额度。

### 第三层：抽奖机会（不是券）

`DrawTicket` / `LuckyDrawEntry`。活动 2 靠消费额生成，活动 3 靠购券生成。

**用词边界（已核实代码）**：本项目里「抽奖券」一词指的是**券模版 #3 —— 活动 3 里可购买的储值券**
（`lucky_draw_v2` / `exclusive_ballot`），这个叫法是对的，不要改。
需要区分的是 `DrawTicket`（抽奖资格本身），它应称「抽奖机会」。
`CountdownCard.myTicketCount` 是目前唯一指向资格计数的展示位，且尚未接线。

### 易混淆项归位

| | 门槛储值券 | 满减券 |
|---|---|---|
| 例子 | S$100 储值，单次消费满 S$50 才能用 | 满 S$100 减 S$20 |
| 储值 | ✅ 有余额，可分次 | ❌ 一次性 |
| 模型 | `Voucher`（`face_threshold`） | `Coupon`（NDP 满赠已在跑） |

### 折扣券统一（已实现）

「原价代金」与「9 折卡」本是同一模版的两个参数值：

```
discountPercent 0  → 付 100 得 100（原价代金）
discountPercent 10 → 付 90  得 100（9 折卡）
discountPercent 20 → 付 80  得 100（8 折卡）  ← 新增能力
```

统一为 `discount_voucher` + `buildDiscountVoucherSnapshot(percent, tiers)`，折扣率夹在 `[0, 50]`。
`face_open` / `discount_10` 保留为**向后兼容别名**（薄包装，行为不变）——存量商品的
`rulesSnapshot` 已固化这两个 packKind，且业务 UI 有 12 处在匹配它们，不做破坏性重命名。

**抽奖券不与折扣券合并。** 两者都是储值券，看似只差「扣不扣点」，但活动 3 购买时要扣 15%
进真金池。参数化成一个模版后，某次改动很容易把扣点逻辑串到活动 1 上——那就是真金池被污染。
宁可重复，保持两个模版。

---

## 2. 已定稿的商业参数

| 项 | 值 |
|---|---|
| 平台费（活动 1/2） | 阶梯：月流水首 S$30k → 1%；S$30k–100k → 0.7%；>S$100k → 0.5%；**月最低 S$88** |
| 平台费（活动 3） | 2%，含在 15% 扣点内（平台托管奖池、承担实物兑付） |
| 活动 2 商家总率 | `[3%, 15%]`，cashback% 与 draw% 由商家自由分配（各自 `[0, 总率]`） |
| 活动 2 默认 | cashback 3% + 抽奖 2% + 平台 1% |
| 共赢费率 | 发起方设网络最低费率，加入方只能 ≥ 该费率 |
| cashback 有效期 | 不设固定到期日；`24 个月无活动则失效`（任何消费或使用都重置时钟） |
| cashback 属性 | 不可提现、不可转让出网络、不可用现金购买、**不可用于购买活动 3 的券** |
| 对外文案 | "消费抵扣额度"，**禁止**使用"等于现金" |
| 活动 2 奖池 | 杠铃：instant / grand = **35 / 65**；中间档为 0 |
| 活动 2 奖品 | **只能是额度**：即时小奖并入消费额度；大奖发独立券，可分期发多张 |
| 活动 3 奖品 | 可以是实物（现有 `default_grand_v1`：iPad / iPhone / BYD） |

---

## 3. 资金模型（本轮最重要的修正）

### 3.1 活动 2 专享阶段不需要储备金

品牌专享下，额度只能在自家门店用。发 S$3 额度 = 商家承诺未来给 S$3 商品 = **一笔负债，不动现金**。
核销时商家交付商品，真实成本是 `S$3 × COGS`。
让商家在发放时先从钱包扣 S$3 真金，等于逼他预付 100% 面额去兑付一个只值 40% 的承诺，
而且是付给自己——**纯账面搬运，无风控价值**。

| 场景 | 计提是否扣真金 |
|---|---|
| **专享（Phase 1）** | ❌ 只记负债 `cashbackIssuedCents` |
| **共赢（Phase 3）** | ✅ A 店发、B 店核销，B 真的损失商品，必须从 A 收真金 |
| **平台费** | ✅ 永远真金（扣不动则记欠，月末结算） |

### 3.2 降级机制（触发条件已修正）

不再是"钱包余额不足"，而是**平台费欠费**：

| 商家欠费 | `fundingTier` | cashback | 抽奖 | 提示 |
|---|---|---|---|---|
| 无欠费 | `full` | 全额 | 全权重 | 正常 |
| 欠费 ≥ S$200 | `degraded` | 降为 1% | 权重 ×0.2 | 商家端红字告警 |
| 欠费 ≥ S$500 | `points_only` | 不发额度 | 不发抽奖 | "本次仅累积积分" |

- 复用 `EXCLUSIVE_GIFT_WEIGHT_FACTOR = 0.2`
- `giftBalance`（平台赠送 S$300）只能抵平台费，不能发 cashback
- 触发 `degraded` 时给商家发一次通知（`src/lib/messaging.ts`，受 `MESSAGING_MODE` 门控）
- 欠费 = `Σ(platformFeeCents − platformWaivedCents − platformFeeChargedCents)`，按 `businessId` 聚合

### 3.3 顾客钱包三分区

| 分区 | origin | 内容 | 可提现 | 有效期 |
|---|---|---|---|---|
| 购券余额 | `purchase` | 活动 1 折扣券 + 活动 3 抽奖券 | ✅ | 活动 / 相对天数 |
| 消费额度 | `cashback` | cashback + **即时小奖（合并）** | ❌ | 24 个月无活动失效 |
| 大奖券 | `prize` | 活动 2 延迟大奖，可分期多张 | ❌ | 每张独立 `expiresAt` |

即时小奖金额小、性质与 cashback 完全相同（都是不可提现的消费额度），**并入消费额度**，
不单列，减少钱包碎片。大奖金额大、需独立有效期与仪式感，单独发券。

---

## 4. 消费金额采集：店员出码 · 顾客扫码

平台不经手支付，系统不知道顾客花了多少钱。cashback 与抽奖权重都按消费金额算，必须解决采集。

| 方式 | 店员负担 | 作弊风险 | 采用 |
|---|---|---|---|
| 顾客扫固定码，自己填金额 | 零 | **高**（可填 S$800 实花 S$5） | ❌ |
| 店员后台录手机号 + 金额 | 高 | 零 | 备用路径 |
| **店员出码 · 顾客扫码** | 低（只输一个数字） | 零 | ✅ **主路径** |
| 小票印一次性二维码（POS） | 零 | 极低 | Phase 4 |

```
收银时店员输入 S$80  →  屏幕生成二维码（含金额 + 一次性 token）
        ↓
顾客扫码  →  自动绑定手机  →  直接进抽奖页
        ↓
即时奖当场开出 → 并入消费额度      大奖签累积 → 进倒计时
```

- token 一次性、短时效（默认 10 分钟）、扫过即失效
- 顾客不愿扫码时退回"店员手输手机号"路径，两条都保留
- 防重复仍用 `receiptFingerprint`

---

## 5. Schema

### 5.1 A 组已完成（2026-08-22）

```prisma
model Voucher {
  origin            String    @default("purchase")  // purchase | cashback | prize | gift | promo
  feeExempt         Boolean   @default(false)       // 核销零抽点
  lastActivityAt    DateTime?                       // 活跃即长期有效
  inactivityMonths  Int?
}
model Campaign {
  cashbackPoolCents   Int      @default(0)
  cashbackPaidCents   Int      @default(0)
  minTotalPercent     Float?
  transferPricingMode String   @default("redeemer_full")
}
model BusinessTemplate { cashbackPercent / drawPercentCfg / platformTierJson }
model SpendRecord      { ... 含 fundedByBusinessId }
model PlatformFeePolicy{ ... }
```

### 5.2 B 组变更（本轮）

```prisma
model Campaign {
  // 语义修正：不再是「储备金」，而是「记账负债」
  cashbackIssuedCents   Int  @default(0)   // ← 原 cashbackPoolCents
  cashbackRedeemedCents Int  @default(0)   // ← 原 cashbackPaidCents
  /// 未核销负债上限（分）；null = 不限
  maxOutstandingCents   Int?
  /// 大奖券默认有效天数
  prizeVoucherValidDays Int?
}

model SpendRecord {
  /// 平台费实扣（扣不动的部分即为欠费）
  platformFeeChargedCents Int @default(0)
  /// 即时小奖金额（并入消费额度，单列便于报表）
  instantPrizeCents       Int @default(0)
}

model Voucher {
  /// 券自身到期时刻。此前靠 Campaign.endDate 经 computeEntitlementExpiry 推导；
  /// 大奖券需要每张独立有效期，故显式落库。null = 沿用旧推导（存量券不受影响）
  expiresAt DateTime?
}
```

Phase 2 追加（本轮不做）：`VoucherDraw.prizeId`、`Campaign.awardedGrandPrizeIds`（逐档解锁用）。

---

## 6. 默认活动

品牌开通后自动铺 5 个 slot，两个 active，三个 draft。

| slot | 活动 | 默认 | 说明 |
|---|---|---|---|
| `long_discount_10` | 9 折优惠卡 | **active** | 已有，只补编辑页 |
| `cashback_draw` | 消费返余额 + 抽奖 | **active** | **本次新建** |
| `grand_countdown` | 大奖倒计时 | draft | 已有；需商家理解购券模式、可能涉托管，不自动激活 |
| `long_face_open` | 原价代金券 | draft | 已有 |
| `ndp_gift` | 节日满赠 | draft | 已有 |

活动 1 商家可改：折扣率（`editable.discountPercent`）、面额档位（`editable.enabledTiers`，
允许列表外整数面额 ≥2）、有效期（`computeEntitlementExpiry`）、起止/激活/停止
（`Campaign.startDate/endDate/status`）、参与门店（`storeIds` + `storeIdsAllows()`）。
**逻辑全部已有，只缺 UI。**

---

## 7. 活动 2 奖品设计（纯额度奖包 `cashback_credit_v1`）

现有 `PRIZE_PACK_DEFAULT_GRAND_V1` 即时奖加权期望 **S$3.66/次**，是给"买 S$50–200 券才抽一次"
标定的，直接套到"每笔消费抽一次"会亏穿。活动 2 需新建纯额度奖包。

**标定公式：**
```
每笔即时奖期望 EV = 客单价 × drawPercent × (instantPoolRatio / 100)
```

**低客单保护：** `EV < S$0.30` 时强制启用累计门槛（复用现有 `Campaign.receiptMinSpend` +
`ticketsPerUnit`），把单次 EV 顶到 S$0.30 以上。
（咖啡店客单 S$8 × 5% × 35% = S$0.14，抽出"恭喜获得 S$0.10"是侮辱。）

**大奖面额必须挂客单价，且分期发放：**
```
震撼阈值 ≈ 100 × 客单价     客单 S$25 的餐厅 → S$2,500
```
一张 S$2,400 的券顾客会囤货式一次用完；拆成 12 张 S$200 月券就是 12 次回店。
大奖包装成「全年免单」而不是「一张巨额券」——叙事更好、成本可控、复购拉动强得多。

**实物大奖归活动 3。** 活动 2 的奖池是记账额度，不得承诺任何需要真金采购的奖品。

> **合规：** 奖品为自家商品/服务的抵扣额度（非现金、非实物），促销抽奖豁免适用性较干净。
> 活动 3 的实物奖建议按金额分层：< S$5k 商家自采、平台记录；≥ S$5k 平台托管采购
> （现有 `requiresEscrow` 已在 BYD 上置位）。上线前走法务。本文档不构成法律意见。

---

## 8. 平台阶梯费率与促销减免

### 8.1 `src/lib/platform-fee.ts`

```ts
export const PLATFORM_FEE_TIERS = [
  { upToCents: 3_000_000,  percent: 1.0 },   // 首 S$30k
  { upToCents: 10_000_000, percent: 0.7 },   // S$30k–100k
  { upToCents: Infinity,   percent: 0.5 },
];
export const PLATFORM_MIN_MONTHLY_CENTS = 8_800;  // S$88

/** 按商家当月累计流水算这一笔的边际平台费（跨档分段，不用整月单一费率） */
export function marginalPlatformFee(mtdGmvCents: number, amountCents: number): number;
/** 月末补齐保底 */
export function monthlyMinimumTopUp(chargedThisMonthCents: number): number;
```

边际分段计费是必须的，否则商家月末冲量跳档会产生账单争议。保底在月末结算补收，交易时不收。

### 8.2 `PlatformFeePolicy` 五条硬规则

`FEE_PLATFORM_PERCENT = 2` 硬编码于 `src/lib/activity-fees.ts`，且
`src/lib/business-templates.ts:93` 明确校验「平台费不可改」。减免**不能改常量**，走本表覆盖。

1. **免率必须能同时免保底**（`waiveMinimum`）。只免 1% 却仍收 S$88 = 商家算完账发现还要交钱，信任当场崩。
2. **免掉的部分归商家，不转奖池。** 商家总成本 6% → 5%，顾客权益不变。合同写明促销期后恢复。
3. **减免记两笔账，绝不记 0。** 「应收 `platform_fee`」+「减免 `platform_fee_waiver`」，净额 0。
   直接不记账将永久失去补贴成本 / 单商家 CAC / 促销到期转化率的分析能力，且无法事后补回。
4. **到期自动恢复 + 提前通知。** 到期前 30 / 7 天各推一次；到期当日切回标准费率 + 后台横幅。禁止静默恢复收费。
5. **仅 admin 可创建/撤销**，`reason` + `approvedByUserId` 必填。销售不得在商家后台自助操作。

**预置套餐：** 启动期全免 3 个月（`waive_all` + `waiveMinimum`）/ 早鸟永久 0.5%（`rate_override`）/
**保底豁免**（`waive_minimum`，月流水未达 S$8,800 不收保底——对小商家最友好且平台不亏，作为新商家默认）。

---

## 9. 品牌多店

代码本来就是品牌级：`business = 品牌`，`Store` 是子级，`Membership` 按 `businessId` 唯一，
`TokenAccount` 按 `businessId`，`Campaign.storeIds` + `storeIdsAllows()` 已提供门店范围控制。
**「品牌专享 + 品牌内任意门店通用」是默认形态，不需要架构改动。**

1. **门店级损益归属**：A 店发的额度在 B 店核销 → B 店营业额被摊薄，店长会抵制。
   数据已齐（`SpendRecord.storeId` = 发放店，`VoucherUsage.storeId` = 核销店），
   但 business API 里**没有任何按 storeId 的 groupBy**，报表需新建。
   口径二选一（`transferPricingMode`）：`redeemer_full`（默认）/ `issuer_bears`。
2. **加盟店 = 品牌内的迷你共赢网络**，与 Phase 3 `CashbackPool` 同一套逻辑，做了即顺带解决。
   Phase 1 唯一动作：`SpendRecord.fundedByBusinessId` 落库（直营恒等于 `businessId`）。
3. **门店级开关要有，门店级费率不要有**（避免顾客体感割裂）。
4. **顾客侧恒为品牌级单一额度**。

---

## 10. 实现进度

### A 组 — Schema + 资金红线 ✅ 已完成 2026-08-22

- [x] `Voucher.{origin,feeExempt,lastActivityAt,inactivityMonths}` + 索引
- [x] `Campaign` cashback 字段 + `transferPricingMode`
- [x] `BusinessTemplate` cashback 费率字段
- [x] 新模型 `SpendRecord`（含 `fundedByBusinessId`）、`PlatformFeePolicy`
- [x] `splitRedeemAmount` **入口**短路：`feeExempt` 券零抽点（任何调用路径绕不过）
- [x] withdraw / refund-exclusive / split 三处 `origin !== "purchase"` → 403
- [x] 核销刷新 `lastActivityAt`
- [x] `tests/cashback-guards.test.ts` 11 用例

### B 组 — 计提引擎 + 平台费 ✅ 已完成 2026-08-22

- [x] Schema：`cashbackPoolCents`→`cashbackIssuedCents`、`cashbackPaidCents`→`cashbackRedeemedCents`、
      `Campaign.{maxOutstandingCents,prizeVoucherValidDays}`、`SpendRecord.{platformFeeChargedCents,instantPrizeCents}`、
      `Voucher.expiresAt`
- [x] `src/lib/platform-fee.ts`：边际分段费率 + 月保底
- [x] `src/lib/platform-fee-policy.ts`：`resolveActivePolicy()` + 减免两笔账
- [x] `src/lib/cashback.ts` 重写为负债模型：
      `computeAccrual()` / `resolveFundingTier()`（按欠费）/ `recordSpend()`（单事务）
- [x] 购券路径守卫：导出 `assertBalanceUsableForPurchase()` + 在 `voucher-purchase.ts` 留标记
      （**注**：当前购券只支持 Stripe / 现金 / 免费，无「余额支付」路径；守卫为新增该功能时的强制入口）
- [x] 单测：分段费率、跨档、保底、三档降级、减免两笔账净额 0、指纹去重、负债累计

### C 组 — 折扣券统一 ✅ 已完成 2026-08-22

- [x] `discount_voucher` 加入 `DefaultPackKind` + `BASE_CATALOG_PACKS` + `isBaseCatalogPack`
- [x] `buildDiscountVoucherSnapshot(percent, tiers, opts)` 统一 builder；折扣率夹在 [0, 50]
- [x] `buildFaceOpenSnapshot` / `buildDiscount10Snapshot` 改为薄包装（行为不变，向后兼容）
- [x] `catalog.ts` 支持 `packKind: "discount_voucher"` + `discountPercent` 入参
- [x] 长期券归类 / 发现 / 权益判定四处接受统一模版
- [x] `tests/discount-voucher-template.test.ts` 12 用例（含"两个旧 builder 与统一 builder 只差 packKind"）

### D 组 — 采集与后台（活动 2）✅ 已完成 2026-08-22

- [x] `/api/business/cashback/setup`：活动配置（费率滑块 + 门店 opt-in + 成本预览）
- [x] `/api/business/cashback/issue-token`：店员出码（金额 + 一次性 token，10 分钟）
- [x] `/api/cashback/claim`：顾客扫码领取（绑手机 → 发额度 → 积分）
- [x] `/business/cashback-desk`：收银台出码页（staff 可用）
- [x] `/business/cashback`：活动配置页
- [x] 备用路径：顾客未登录时在领取页手输手机（`findOrCreateCustomerByPhone`）
- [x] 顾客钱包三分区（`src/app/(tabs)/balance/page.tsx`）
- [x] `/api/business/cashback/store-report`：门店级发放 vs 核销对账
- [x] `middleware.ts`：`/business/cashback` 加入 STAFF_BLOCKED（精确匹配不误伤 `-desk`）
- [x] 新增 `CashbackClaimToken` 模型 + `src/lib/cashback-token.ts`（一次性令牌，原子消费）
- [x] `tests/cashback-claim-flow.test.ts` 10 用例

### E 组 — 券模版后台（活动 1）✅ 已完成 2026-08-22

- [x] 折扣券编辑页：折扣率滑块 / 面额档位 / 有效期 / 起止 / 门店（逻辑已有，只做 UI）
- [x] 门槛储值券：复用折扣券页 + 最低消费倍数
- [x] 满减券 / 折扣权益券 / 赠品券：既有 `/business/coupons/new` 向导已覆盖三种 type，
      索引页以 `?type=` 直达并预填
- [x] 「新建券」菜单不出现抵扣额度与奖励券；`/api/business/products` 加 `SYSTEM_ISSUED_KINDS` 守卫
- [x] 文案边界核实：「抽奖券」在本项目指券模版 #3（正确），不做全局改名；见 §1.3
- [x] 折扣券支持 `validDays`（购后 N 天）与 `minSpendMultiplier`
- [x] `tests/voucher-template-catalog.test.ts`

### Phase 2 / 3 / 4（本次不做）

### Phase 2 — 抽奖接入 ✅ 已完成 2026-08-22

- [x] `src/lib/templates/cashback-prizes.ts`：`calibrateBarbellPack()` 按实际 EV 反解权重
- [x] **不可达即上报**：EV ≤ 最小奖额（S$0.20）时无解，返回 `feasible:false` + `overspendCents`，
      不静默超发（目标 S$0.18 若硬发会变成 S$0.33，商家每笔多掏 80%）
- [x] `src/lib/cashback-draw.ts`：即时奖并入消费额度券、逐档解锁、大奖分期
- [x] `recordSpend` 接入抽奖：奖池先入账再开奖
- [x] **大奖档位按活动配置的 `avgTicketCents` 生成，不按单笔金额** —— 否则顾客花 S$5 与
      S$500 会看到不同解锁目标，进度条来回跳
- [x] schema：`VoucherDraw.prizeId`、`Campaign.{awardedGrandPrizeIds,prizeInstalments}`
- [x] 默认活动新增 `cashback_draw` slot；slot 加 `defaultStatus`（两个 active、三个 draft）
- [x] 顾客领取页展示即时奖 + 大奖进度条
- [x] `tests/cashback-draw.test.ts` 23 用例 + 端到端 HTTP 验证

**未做（留待后续）**：`SpendRecord → DrawTicket` 独立抽奖机会记录、大奖实际发放流程
（`creditInstantPrize` 已就绪，解锁后的发券入口待接）、消费额→大奖权重映射。
现阶段大奖只累积与展示进度，不自动开奖。
- **Phase 3**：共赢 `CashbackPool` 托管 + 跨店划付 + 网络最低费率 + 四条风控
  （配比上限 150%、贡献挂钩权重、周对账、退出冻结）；加盟连锁同时解决。
- **Phase 4**：小票 AI 采集（`src/lib/receipt-parse.ts` 已有）、POS 一次性码。

---

## 11. 三层对象模型（券产品 / 活动 / 镜像）

```
券模版(packKind)  ──→  VoucherProduct（券产品）
活动模版          ──→  Campaign role="activity"（活动）
                        └─ CampaignProduct ──→ 挂上券产品
```

**这个模型是对的，但数据库里还有第三类对象，是后台看着乱的根源：**

| role | 是什么 | 后台该怎么处理 |
|---|---|---|
| `activity` | 真活动 | 展示 |
| `product_mirror` | **每个券产品的同名影子**（1:1），只为兼容旧购券路径（`Voucher.campaignId` 必填） | **过滤掉** |

Meow BBQ 实测：4 个券产品 → 4 个镜像 + 4 个真活动 = 8 个 Campaign。
后台若不按 `role` 过滤，"9折优惠卡"会出现两次（一次是产品影子，一次是它挂着的"长期券"）。

**另外两个不对称，是设计如此，不是 bug：**

1. **规则型活动没有券产品。** 活动 2（`cashback`）与国庆满赠的 `catalogProducts` 为空——
   它们是规则引擎，不卖券。所以"活动添加券产品"只对活动 1、活动 3 成立。
2. **建券产品会自动建/并入活动。** `createShelfActivity: true` 时，原价代金 / 9折卡 /
   门槛券被自动并进**同一个**「长期券」容器，三步压成一步。

---

## 12. 试点商家 Meow BBQ（可重置）

```bash
npm run db:seed-meowbbq     # 建/补齐（幂等）
npm run db:reset-meowbbq    # 清空活动/产品/券/流水后重建
npm run db:show-meowbbq     # 只打印当前三层结构
```

`scripts/seed-meowbbq.ts`。商家 `businessSlug: "meow-bbq"`，两家门店，
自充 S$500 + 平台赠送 S$300。

**补充产品只建默认活动没提供的**——`ensureDefaultActivities` 已给出
「原价代金」「9折优惠卡」「大奖倒计时」，脚本再建同类只会得到
"原价代金" vs "原价代金券" 两个近似重名的产品，正是后台看着乱的原因。
脚本只补「门槛储值券」（不在默认 slot 里）。

重置后默认结构：

| 层 | 内容 |
|---|---|
| 券产品 4 | 9折优惠卡(active) / 原价代金(draft) / 大奖倒计时(draft) / 门槛储值券(draft) |
| 活动 4 | 长期券(active) / 大奖倒计时(draft) / 国庆满赠(draft) / 消费返+抽奖(active) |
| 镜像 4 | 四个产品的同名影子 |

---

## 13. 会员系统归位（2026-08-23）

会员层是项目里最早写的一层，心智还停在传统「积分换券」。cashback 上线后
「消费 → 回报」这条主路已经由额度和抽奖接管，积分处在只进不出的悬空状态。
本轮做两件事：先把串账堵上，再让等级真正影响钱。

### 13.1 串账修复 ✅

**问题**：积分有两套并存且互通。

| | 字段 | 谁在发 | 谁在花 |
|---|---|---|---|
| 品牌积分 | `Membership.points` | 消费 / 核销 / 商家手动 | 没有出口 |
| 平台积分 | `User.pointsBalance` | 签到 / 商家手动 / 领券赠分 | `coupon.pointsRequired` |

领券扣的是**平台**那套 → A 商家发的分能兑 B 商家的券，券是 B 的真实库存，
成本没人承担。签到分还会整笔记到「最近一次核销的商家」头上，归属纯靠猜。

**修法**：

- `Membership.points` 成为**唯一可花货币**，作用域是发放它的品牌
- 领券（`api/coupons/[id]/claim`）改扣品牌积分；券详情页的「还差多少分」同步改读品牌积分
- 领券赠分（`giftType === "points"`）改进品牌账 —— 发券商家自己的负债
- 商家手动发放不再同时涨 `User.pointsBalance`
- 签到删掉「记到最近核销商家」那段：平台不能替商家发分。签到只涨
  `User.pointsBalance` / `lifetimePoints` / 连签天数，是平台侧成长值，不可兑券
- 新增 `src/lib/points.ts` 的 `getBrandPoints` / `grantBrandPoints` / `spendBrandPoints`；
  **任何「扣积分换东西」的新路径必须走这三个函数**，不得直接改 `User.pointsBalance`
- 扣减用 `updateMany` + `points: { gte: amount }` 条件，查与扣落在同一条语句，
  并发领券扣不成负数（有测试）

### 13.2 等级不再随余额抖动 ✅

积分一旦可花，`Membership.points` 就不能再兼任等级依据 —— 顾客花积分领券会掉级。

- 新增 `Membership.lifetimePoints`：累计获得，只增不减
- 所有发放点同时涨 `points` 与 `lifetimePoints`；扣减只动 `points`
- `checkAndUpgradeTier` / `calculateTier` 一律读 `lifetimePoints`
- 商家会员详情新增「累计积分」，升级进度条改按累计算
- 历史数据回填：`scripts/backfill-membership-lifetime-points.ts`
  （引入该字段前品牌积分从未被扣过，故 `lifetimePoints = points` 成立）。
  **上生产必须在 db push 之后、开放领券扣分之前跑一次**，否则老会员会被复算成 regular

### 13.3 等级 × cashback 联动（方案 A）✅

等级此前没有任何经济含义 —— `benefits` 只是卡片上的文案。现在给它一个旋钮：

- `MembershipTierConfig.cashbackBonusPercent`（Float，默认 **0**）：该等级的额外返现百分点
- 计提时 `cashbackPercent = 基础 + 加成`，抽奖比例**不动**
- 上限两道：单档 ≤ 5 个百分点（`TIER_BONUS_PERCENT_MAX`，API 校验）；
  且「基础 + 加成 + 抽奖」≤ `TOTAL_PERCENT_MAX`(15)，超出部分静默截断（`applyTierBonus`）
- 欠费降级时加成失效 —— `degraded` 的 1% 是硬顶，加成不能绕过；`points_only` 全为 0
- 适用的是**本笔消费之前**的等级：这笔带来的升级从下一笔生效，
  因此 `recordSpend` 里顾客解析被提到计提之前
- `SpendRecord.memberTier` / `tierBonusPercent` 落库，便于回答「这笔为什么是 4%」

**为什么只动返现、不动抽奖**：抽奖池比例决定小奖 EV，奖品档位是按 EV 标定的
（§7）。让等级影响抽奖，等于每个等级都要重标一套奖包。返现是纯加性负债，
容易封顶、容易解释。

**默认值为什么是 0**：加成是商家的额外成本。默认给出加成 = 平台替商家做主涨价。
试点商家 meowbbq 在 seed 里主动配了 0 / 0.5 / 1 / 2，作为示范。

真实数据验证（meowbbq · S$80 消费 · 活动「消费返 + 抽奖」3%+2%）：

| 等级 | 加成 | 实际返现率 | 到账 |
|---|---|---|---|
| 普通会员 | +0% | 3% | S$2.40 |
| 金卡会员 | +1% | 4% | S$3.20 |

### 13.4 仍未做（记录在案）

- 品牌积分除领券外仍无其他出口；等级除返现加成外仍无其他经济含义
- `User.pointsBalance` 目前只剩签到在涨，且花不掉 —— 要么给它一个平台级用途，
  要么下一轮降级为纯统计字段
- 会员权益 `benefits` 仍是纯文案，不被任何逻辑读取

---

## 14. 满赠归位（2026-08-23）

### 14.1 券的分类轴不是算法，是作用时点

| | 作用时点 | 商家出钱的时点 | 驱动什么 | 成本曲线 |
|---|---|---|---|---|
| 折扣券 `percentage` | 本单 | 立刻 | 成交 | 敞口，账单越大出得越多 |
| 满减券 `fixed_amount` + `minSpendCents` | 本单 | 立刻 | 成交 | 封顶，单张成本固定 |
| **满赠** | **下次** | **顾客回头时** | **回访** | 阶梯 |

折扣与满减是同一类 —— 顾客付款时账单变小，交易结束。满赠不动本单，
发的是下次消费的资产。这个差别比前两者之间的差别大得多。

### 14.2 满赠 = cashback 的阶梯版

- cashback：消费 × 3% → 下次用的额度（连续）
- 满赠：满 S$120 → S$61（阶梯）

**两者发的都是下次消费的额度，都是商家的记账负债，都不是真金。**
所以必须共用同一对计数器：

```
发放 → Campaign.cashbackIssuedCents  += 面额
核销 → Campaign.cashbackRedeemedCents += 面额
```

阶梯会制造凑单（差 S$8 就送 S$61，顾客会再点一份），连续则是平滑激励。

### 14.3 负债账（这是个真实的洞）✅

**问题**：国庆满赠发出去的 S$61 只创建 `CustomerCoupon`，不进任何负债账。
结果是商家开一个满赠活动，就能绕开 cashback 活动上的 `maxOutstandingCents`
与欠费降级，无限量发额度。

**修法**（`src/lib/spend-and-get.ts`）：

- `Coupon.origin`（新字段，`manual` | `spend_get`）标记满赠券。核销时靠它识别，
  老模版在 `ensureNdpGiftCoupon` 里自动补标记
- 发放：`issueNdpGrantDual` / `issueNdpGiftCouponOnly` 累加 `cashbackIssuedCents`
- 核销：`api/business/redeem` 里 `origin === "spend_get"` → `recordGiftRedeemed`
- **闸门 `assertCanIssueGift`**：欠费 ≥ `OWED_DEGRADE_CENTS` 停发；
  未核销额度超上限停发
- **上限按商家汇总，不按活动**（`businessOutstandingLiabilityCents`）——
  顾客手上的额度是商家要兑付的，只按活动查，商家再开一个活动就能重新开一条口子。
  有专门的测试覆盖这条绕过路径

满赠是固定面额，没法像百分比那样「降级到 1%」，所以欠费只有通过 / 不通过两种
结果，阈值取较严的 `OWED_DEGRADE_CENTS`。

`issueNdpGiftCouponOnly` 是核销后的尽力而为钩子，闸门失败返回 `null` 而非抛错 ——
顾客的核销已经成功，不能因为发不出赠券把整笔核销回滚。

### 14.4 通用化：满赠是模版，国庆是预设 ✅

- `SpendGetRules` 是规则的唯一定义，`NdpRules` 降为它的别名
- `parseSpendGetRules` 是唯一解析器，同时认 `spendGet` 与 `ndp` 两个键
  （**线上存量活动写在 `ndp` 下，改键名会让它们读不到规则**）
- `validateSpendGetRules`：赠额 < 门槛，且 ≤ 门槛的 60%（`MAX_GIFT_RATIO`），
  有效期 1–365 天。满 100 送 80 等于把下一单直接送掉
- 新增 `GET/PUT /api/business/spend-get` + `/business/spend-get` 配置页：
  商家自己填「满多少、送多少、几天有效」，页面同时显示名义成本率与全店未核销额度
- 活动模版文案去国庆化：`满赠 · 满120送61`，国庆只是它的默认值
- `holiday` 类型活动在活动列表里直达配置页，与 `cashback` 一致

### 14.4b 彻底去掉国庆特判（第二轮）

第一轮保留了 `ndp` 内部命名，理由是「改名会破坏线上 URL」。这一轮做完了 ——
国庆不再作为一种东西存在，它只是满赠的一组默认值。

| 旧 | 新 |
|---|---|
| `src/lib/ndp-promo.ts` | `src/lib/spend-get-issue.ts` |
| `NDP_*` / `Ndp*` / `ndp*` 标识符（约 60 个） | `SPEND_GET_*` / `SpendGet*` / `spendGet*` |
| `/api/business/promo/ndp/issue` | `/api/business/spend-get/issue` |
| `/api/business/promo/ndp/setup` | `/api/business/default-activities`（它本来就不只管满赠） |
| `/api/business/promo/ndp/receipt-ocr` | `/api/business/spend-get/receipt-ocr` |
| `/business/ndp-desk` · `/business/ndp-issue` | `/business/spend-get-desk` · `/business/spend-get-issue` |
| `/ndp/[slug]`（公开落地页） | `/spend-get/[slug]` |
| category / slot / tag `ndp`、`ndp_gift` | `spend_get` |
| `rulesSnapshot.ndp` | `rulesSnapshot.spendGet` |
| `issueReason: "ndp_draw_entry"` | `"spend_get_draw_entry"` |
| 主题色 `ndp_red` · 模版 `festival_ndp` | `deep_red` · `festival_red` |
| `SG_NDP_RED` | `FESTIVAL_RED` |

配套三件事：

1. **`/ndp/[slug]` 保留为永久 301**。这个地址已经印在桌卡和前台二维码上，
   印出去的东西改不了。跳转页把 `from` / `seller` 等查询参数原样带过去。
   QR 接口同时认 `spendGet=1`（新）与 `ndp=1`（旧链接里的）。
2. **读取侧兼容存量**：`parseSpendGetRules` 同时认 `spendGet` 与 `ndp` 键；
   `isSpendGetCampaign` 同时认新旧 tag。写入侧一律写新键。
3. **数据迁移** `scripts/migrate-ndp-to-spend-get.ts`：tags / rulesSnapshot /
   slug / 活动名 / 赠券模版标题 / `issueReason` / `visualTemplateId` 全部改写，
   已在 dev 跑过。跑完之后上面那些兼容分支才能删。

顺带修掉三个被国庆绑架的行为：

- **默认活动窗口**从「8/1–8/31 新加坡国庆档」改成「从今天起 365 天」。
  满赠是长期活动模版，不该默认落在某个节日的档期里。
- **节日红视觉不再自动套用**。`isFestivalNdpCampaign` 以前判「type === holiday
  或名字里有国庆」——于是每个满赠活动都被自动涂成新加坡国庆红并加上星月装饰。
  现在拆成两个函数：`isSpendGetCampaign`（活动类型，决定链接指向与文案）与
  `isFestivalRedCampaign`（只认商家显式选的主题色/标签，决定视觉）。
- **赠券标题跟着配置走**。以前写死「国庆赠送券 S$61 / 30 天有效」，商家把满赠
  改成满 200 送 80 之后顾客券包里显示的仍是 S$61。现在
  `spendGetCouponTitle(giftCents)` / `spendGetCouponDescription(validDays)`
  按活动实际参数生成，模版被复用时会刷新。

### 14.5 满减券：从装饰变成真校验 ✅

`Coupon.minSpendCents` 以前**只在核销查询接口里返回给店员看一眼，POST 从不校验** ——
一张「满 S$100 减 S$15」的券买 S$20 的东西也能核销掉。

储值券那条路（`/api/voucher/redeem`）早就用 `billCents` 校验了。现在
`/api/business/redeem` 沿用同一套约定：

- `minSpendCents > 0` → 必须带 `billCents`（或别名 `orderCents`），
  缺失返回 `code: "BILL_REQUIRED"`，未达返回 `code: "MIN_SPEND"`
- GET 增加 `requiresBill`，收银台据此先弹账单金额输入框
- 建券页去掉「(元)」的币种错误，并说明设了门槛后店员核销要输金额

**没有删掉这个字段**：既然储值券侧的 `billCents` 机制现成，把满减券做真
比删掉它更划算。审计过 dev 库，`minSpendCents > 0` 的券模版数量为 0，
所以没有存量行为被改变。

### 14.6 仍未做

- 满赠的赠额没有像 cashback 那样接入平台费 —— 满赠只发额度不收费，
  平台在这条路上没有收入。要不要收、怎么收，未定
- 满赠没有降级档（只有发/不发两态）
- `Coupon.origin` 目前只有 `manual` / `spend_get` 两个值，
  将来若有其他系统发放的权益券应复用它

---

## Global Constraints

- 币种一律 `S$`，金额存分，展示走 `formatMoney`
- 错误文案中文，`{ error }` + HTTP status；受保护路由先 `getSession()`
- 不引入新 auth / 校验库；禁止 `prisma migrate`，只用 `db push`
- **真金池只接受真金，额度池只发额度，两者之间不设兑换通道**
- cashback 券永远 `feeExempt = true`，永远不可提现
- cashback 余额不得用于购买活动 3 的券
- `exclusive_ballot`（购券时抽）与 `cashback`（消费后计提）触发点不同，禁止合并或改写
- 活动 2 的奖池是记账额度，不得承诺需要真金采购的奖品
- `SpendRecord.fundedByBusinessId` 必须落库，即使 Phase 1 恒等于 `businessId`
- 平台费减免永远记两笔账（应收 + 减免），禁止记 0
- 门店费率由品牌统一，分店只有 opt-in/opt-out
- 后台列活动必须按 `role === "activity"` 过滤，排除 `product_mirror` 影子
- 试点商家 seed 脚本不得重复创建默认活动已提供的券产品
- 抽奖券模版不得与折扣券模版合并（活动 3 购买扣 15% 进真金池）
- 抵扣额度（`cashback`）与奖励券（`prize`）只能系统发放，不进「新建券」菜单
- `DrawTicket`（抽奖资格）称「抽奖机会」；券模版 #3（可购买的储值券）仍称「抽奖券」
- 对外文案禁止"等于现金"
- **积分是发放它的品牌的负债，只能在该品牌内花掉**；扣积分一律走
  `spendBrandPoints`，禁止直接改 `User.pointsBalance`
- 等级依据永远是 `Membership.lifetimePoints`，不是 `points`（花积分不掉级）
- 等级返现加成受两道上限约束，且必须在降级档失效
- **满赠发的额度与 cashback 额度是同一种负债**，共用
  `cashbackIssuedCents` / `cashbackRedeemedCents`，发放前必过 `assertCanIssueGift`
- 未核销额度上限按**商家**汇总，不按活动 —— 按活动查等于给绕过留门
- 满赠券模版必须带 `origin = "spend_get"`，否则核销时冲减不到负债
- `minSpendCents > 0` 的券核销必须带 `billCents`；两条核销路径（券 / 储值券）
  用同一套 `BILL_REQUIRED` / `MIN_SPEND` 约定
- `parseSpendGetRules` 与 `isSpendGetCampaign` 必须继续认旧的 `ndp` 键与 tag ——
  存量活动是那个结构；写入一律写 `spendGet` / `category:spend_get`
- `/ndp/[slug]` 永久保留为 301 跳转：该地址已印在桌卡二维码上
- 「是不是满赠活动」（`isSpendGetCampaign`，管链接与文案）与「要不要节日红视觉」
  （`isFestivalRedCampaign`，只看主题色）是两件事，不得再合并
