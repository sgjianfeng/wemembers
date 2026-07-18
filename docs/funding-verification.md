# 资金与账户验收清单

覆盖：**公司（商户）/ 门店 / 个人（顾客）/ 推广** 的账号设置、充值、提现。

## 1. 角色与产品边界

| 角色 | 钱包载体 | 充值 | 提现 | 账号设置 |
|------|----------|------|------|----------|
| 公司 business | `TokenAccount` + Stripe Connect | Stripe Checkout top-up | Stripe Transfer → Connect | `/business/settings` 可编辑 |
| 门店 store/staff | **无独立钱包**；收入归公司 | — | — | 门店 CRUD `/business/stores` |
| 个人 customer | 券余额 `Voucher` + Token 积分 | 购券 PayNow；积分无现金充值 | 券余额提现 5%/2% | `/profile` 改昵称 |
| 推广 promoter | `PromoterAccount` | 收益入账 | **申请单 MVP**（人工打款） | 推广中心激活 |

## 2. 自动化（已覆盖）

```bash
# 核心资金/账户单测
npx jest --config jest.config.ts tests/funding-accounts.test.ts tests/tokens-t1.test.ts tests/withdraw-economics.test.ts

# 券余额提现
npx jest --config jest.config.ts tests/voucher-draw.test.ts

# E2E 冒烟（需本地 dev + 已登录 cookie/seed）
npx playwright test tests/e2e/funding-accounts.spec.ts tests/e2e/main-scenarios.spec.ts -g "Stripe|tokens|Token"
```

| 用例 | 文件 | 断言 |
|------|------|------|
| 充值入账 + session 幂等 | `funding-accounts.test.ts` | 余额 +1 次、重复 session 不双加 |
| 商户提现门槛/无 Stripe/成功（mock Transfer） | 同上 | min S$10、stripe_not_ready、扣账 |
| 推广提现扣余额 | 同上 | availableBalance 减少 |
| 公司设置 PATCH | 同上 | businessName/phone 更新 |
| 个人昵称 PATCH | 同上 | displayName |
| 门店创建/更新；员工禁改公司设置 | 同上 | 200 / 403 |
| T+1 冻结解冻 | `tokens-t1.test.ts` | frozen → available |
| 顾客券提现 5% | `voucher-draw.test.ts` / `withdraw-economics` | fee 拆分 |

## 3. 手工验收（Staging + 真 Stripe test key）

### 3.1 公司

1. 登录 business → **设置** 改公司名/电话 → 保存 → 刷新仍在。  
2. **门店** 新增/改名门店。  
3. **账户中心** `/business/tokens`：  
   - 点「设置收款账户」完成 Connect Express onboarding（test mode）。  
   - 充值 S$10 → Checkout 付成功 → webhook → 余额增加 + 流水 `stripe_topup`。  
   - 再次用同一 session（重放 webhook）余额**不**双加。  
   - 提现 S$10（可用 ≥10 且非冻结）→ Transfer 成功 → 余额减少 + 流水 `withdrawal`。  
   - 仅有冻结余额时提现 → 提示 T+1。

### 3.2 门店

- 确认员工账号只能核销/会员，**不能**改公司设置、不能进 tokens 管理（middleware）。  
- 核销后公司 `frozenBalance` 增加，T+1 后可提。

### 3.3 个人

1. **我的** 改昵称保存。  
2. 购券 → **我的余额** → 提现（draw 5% / voucher 2%）→ 状态 withdrawn / 余额 0。  
3. 确认无「个人 Stripe 提现」入口（产品设计如此）。

### 3.4 推广

1. 激活推广账号，灌入 `availableBalance`。  
2. `/promoter/withdraw` 选 PayNow/银行 → 申请 ≥ S$10 → 余额扣减。  
3. **注明**：当前为**人工打款**，无自动 Stripe payout。

## 4. 环境变量

| 变量 | 用途 |
|------|------|
| `STRIPE_SECRET_KEY` | Checkout / Connect / Transfer |
| `STRIPE_WEBHOOK_SECRET` | 验签；本地用 `stripe listen --forward-to localhost:3000/api/stripe/webhook` |
| `NEXT_PUBLIC_APP_URL` | Checkout 回跳、Connect return URL |
| `ALLOW_DIRECT_VOUCHER_PURCHASE` | 仅 dev/e2e 跳过购券支付 |

## 5. 已知 MVP 限制

- 推广提现：**记账申请**，非自动到账。  
- 商户提现依赖 Connect `chargesEnabled`；未开户会 400。  
- 顾客 `/my-tokens` 为积分流水，**现金**在券余额与商户 Token 账户。  
- 真卡支付/真 webhook 需 staging 手工勾选 §3。

## 6. 变更入口（实现索引）

- `src/lib/funding.ts` — 入账/提现预检/推广扣款  
- `src/app/api/stripe/{checkout,withdraw,webhook}`  
- `src/app/api/business/settings`  
- `src/app/api/profile`  
- `src/app/api/promoter/withdraw`  
- `src/app/api/business/stores`  
- UI: `business/settings`, `business/tokens`, `profile`, `promoter/withdraw`, `balance`
