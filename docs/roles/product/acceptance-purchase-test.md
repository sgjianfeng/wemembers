# Test 购券验账清单（P0 发布门禁）

> 环境：生产 `https://wemembers.store` · **Stripe Test**（`sk_test`）  
> 支付：Checkout 可选 **Card** · 卡号 `4242 4242 4242 4242`  
> 自动化：活动页 200 + 规则 API 由 `npm run audit:prod` / business E2E 覆盖；**真付一笔需大股东或市场手工**。

## 前置

| # | 项 | ☐ |
|---|-----|---|
| 0.1 | 无痕窗口 | |
| 0.2 | 消费者账号（新注册或已有） | |
| 0.3 | 活动仍 active | 见下表链接 |

## 活动链接（Meow BBQ 试点）

| 产品 | URL | 期望面额 / 实付 |
|------|-----|-----------------|
| A. S$10 代金 | https://wemembers.store/voucher/meow-bbq-s10-voucher | 面值 10 · 折扣 20% · **实付 S$8.00** |
| B. 抽奖三档 | https://wemembers.store/voucher/meow-bbq-draw-3tier | **50 / 100 / 200** · 无折扣 · 建议先买 **50** |

## 路径 A — 代金券

| # | 步骤 | 期望 | ☐ |
|---|------|------|---|
| A1 | 登录消费者 | 进 `/home` | |
| A2 | 打开 S$10 链接 | 页 200，显示 S$10 / 折扣 | |
| A3 | 选 S$10 → 支付 | Checkout 约 **S$8** | |
| A4 | 测试卡支付成功 | 回跳 `?paid=1&session_id=` | |
| A5 | 余额/记录 | `/balance` 有券；**无**即时抽奖文案强依赖 | |
| A6 | Stripe Dashboard Test | 一笔 **S$8.00** paid | |

## 路径 B — 抽奖

| # | 步骤 | 期望 | ☐ |
|---|------|------|---|
| B1 | 打开抽奖链接 | 三档 50/100/200 | |
| B2 | 选 S$50 → 支付 | Checkout **S$50** | |
| B3 | 支付成功 | 即时小奖提示 **或** 余额=50 | |
| B4 | `/balance` | 可见该抽奖券余额 | |
| B5 | Stripe Test | 一笔 **S$50** paid | |

## 商家侧（可选同日）

| # | 步骤 | 期望 | ☐ |
|---|------|------|---|
| M1 | Meow 商家登录 `/for-business` 或登录页企业 tab | 进 `/business` | |
| M2 | 活动列表 | 见两试点活动 | |
| M3 | 核销台 `/business/scan` | 选店后可开（不 5xx） | |

## 自动化已覆盖（无需手工）

```bash
npm run audit:prod
npm run test:e2e:customer-prod
npm run test:e2e:business-prod
```

| 检查 | 证据 |
|------|------|
| 活动页 HTTP | audit + business E2E #4 |
| 折扣/档位规则 | pool-status / campaigns API |
| 消费者注册登录主页 | customer-prod E2E |
| 商家登录与后台页 | business-prod E2E |

## 签字

| 角色 | 日期 | 结论 |
|------|------|------|
| 市场/大股东 | ______ | A+B 各至少一笔 Test 支付：是 / 否 |
| 工程 | ______ | 自动化三门禁绿：是 / 否 |
| 产品 | ______ | 本清单可标「Test 购券路径可用」：是 / 否 |
