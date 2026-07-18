# 主场景检查表（模板 / 购券 / Stripe）

自动化：`npx playwright test tests/e2e/main-scenarios.spec.ts`

| ID | 场景 | 自动化 | 手测补全 |
|----|------|--------|----------|
| A0 | 模板目录 3 个可选 | ✅ | — |
| A | 抽奖模板创建 → Checkout URL → seller 5% | ✅ Checkout + 直购测试 | 测试卡完整付款 + webhook/confirm |
| B | 折扣模板（可调折扣）→ 实付佣金 | ✅ | 顾客折扣券购买页 |
| C | 达人模板 + 邀伙伴同卖同核网络 | ✅ API/UI 片段 | 端到端核销手测 |
| D | Token 页 + Stripe Checkout URL | ✅ 拿到 checkout URL | 测试卡完整付款 + webhook |
| E | 活动列表展示新建活动 | ✅ | — |

## 手测 Stripe（补全真支付）

### 充值（D）
1. `stripe listen --forward-to localhost:3000/api/stripe/webhook`
2. 商家登录 → `/business/tokens` → 充值 → 测试卡 `4242 4242 4242 4242`
3. 回跳 success，流水出现 `stripe_topup`

### 购券抽奖（A）
1. 同上 `stripe listen`
2. 顾客登录 → `/voucher/{slug}` → 选面额 → **支付并抽奖**
3. Stripe 测试卡付款 → 回跳 `?paid=1&session_id=…`
4. 页面「正在确认支付…」后显示中奖/购券结果
5. 也可只靠 webhook 落券（与 confirm 幂等，同一 `stripeSessionId` 不重复发券）

## 命令

```bash
# 主场景 E2E（会起 dev server）
npx playwright test tests/e2e/main-scenarios.spec.ts

# 改 schema 后务必重启占用 3000 的进程，否则 Prisma Client 可能旧
lsof -ti:3000 | xargs kill -9
```
