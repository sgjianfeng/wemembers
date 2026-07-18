# Stripe 生产配置（wemembers.store）

当前线上：`https://wemembers.store`（PM2 + Nginx）。  
部署后应用 **已在跑**；Stripe 需在 Dashboard 与服务器 `.env` 对齐。

## 现状

| 项 | 状态 |
|----|------|
| 站点 | https://wemembers.store → HTTP 200 |
| 健康检查 | `/api/health` → ok |
| 数据库 | PostgreSQL `wemembers`（共享 `platform-postgres`） |
| `STRIPE_SECRET_KEY` | 目前是 **`sk_test_...`（测试模式）** |
| `STRIPE_WEBHOOK_SECRET` | **无效/过短**，需重新配置 |
| Connect | 商户在 `/business/tokens` 点「设置收款账户」走 Express |

**建议验证路径：先用 Test 模式走通全链路，再切 Live。**

---

## A. Stripe Dashboard（Test 模式先做）

### 1. 打开正确账号与模式

1. 登录 [https://dashboard.stripe.com](https://dashboard.stripe.com)  
2. 左上角确认是 **WeMembers 用的账号**  
3. 右上角开关：**Test mode ON**（先测）

### 2. API Keys

**Developers → API keys**

| 变量 | 取自 | 写入服务器 |
|------|------|------------|
| `STRIPE_SECRET_KEY` | Secret key `sk_test_...` | `/var/www/wemembers/.env` |
| （前端若以后需要） | Publishable `pk_test_...` | 当前代码服务端签 Checkout，可不配 |

### 3. Webhook（必做，否则购券/充值不入账）

**Developers → Webhooks → Add endpoint**

- **URL**: `https://wemembers.store/api/stripe/webhook`  
- **Events**:
  - `checkout.session.completed`（购券 + 商户充值）
  - `account.updated`（Connect 开户状态）

创建后点 **Reveal** 拿到 **Signing secret** `whsec_...`  
写入服务器：

```bash
# 在服务器 /var/www/wemembers/.env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

然后：

```bash
pm2 restart wemembers --update-env
# 或
pm2 restart wemembers
```

在 Dashboard → Webhook → 该 endpoint → **Send test webhook**，看是否 200。

### 4. Connect（店家提现/收款）

**Settings → Connect → Get started**（若未开）

- 类型：**Express**  
- 能力：Transfers / Payouts  
- 国家：支持 **SG**  
- Branding：站点 `https://wemembers.store`

店家操作：

1. 登录 business → **账户中心** `/business/tokens`  
2. **设置收款账户** → Stripe 托管 onboarding  
3. 完成银行信息 → 回到站点 `?onboarding=success`  
4. 页面显示账户已激活后，才可提现  

### 5. PayNow（购券）

- 购券 Checkout 代码：`payment_method_types: ["paynow"]`，币种 **SGD**  
- Test 模式：Stripe 提供测试支付方式；Live 需账号已开通 SG PayNow  
- **Settings → Payment methods** 确认 PayNow 对 Checkout 可用  

---

## B. 服务器改密钥（你操作或把 key 给我代改）

```bash
ssh -i ~/.ssh/wemember_key root@43.106.94.37
nano /var/www/wemembers/.env
# 修改：
# STRIPE_SECRET_KEY=sk_test_xxx   # 或 sk_live_xxx
# STRIPE_WEBHOOK_SECRET=whsec_xxx
pm2 restart wemembers
pm2 logs wemembers --lines 30
```

**不要**把 live secret 提交进 Git。

---

## C. 真实验收顺序（Test 模式）

1. **Webhook**  
   - Dashboard 发测试事件 → 服务器 200  

2. **商户充值**（可选）  
   - `/business/tokens` → 充值 → Checkout 测卡/测支付 → 回跳 → 余额增加、流水 `stripe_topup`  

3. **Connect**  
   - 用 test onboarding 完成 Express  
   - `account.updated` 后 `chargesEnabled`  

4. **顾客购券**  
   - 店家创建抽奖/折扣活动 → 打开 `/voucher/{slug}`  
   - PayNow 测试支付 → 回跳 `?paid=1&session_id=`  
   - 出现余额/即时奖；DB 有 `Voucher.stripeSessionId`  

5. **核销**  
   - 店员扫码核销 → 店家 frozen 增加  

6. **提现**（Connect 就绪后）  
   - 小额提现 → Transfer 成功  

---

## D. 切 Live 模式（真钱）

仅在 Test 全通后：

1. Dashboard 关 Test mode  
2. 取 **`sk_live_...`** 与 **Live webhook `whsec_...`**（**另建** endpoint，URL 相同，signing secret 不同）  
3. 更新 `.env` 并 `pm2 restart`  
4. Connect 商户可能要重新/完成 Live onboarding  
5. 先 **小额** 真 PayNow 试一笔  

---

## E. 常见问题

| 现象 | 处理 |
|------|------|
| 支付成功但无券 | Webhook secret 错 / 未配 endpoint |
| Invalid signature | `STRIPE_WEBHOOK_SECRET` 与 endpoint 不匹配（test/live 混用） |
| 提现提示完成收款设置 | Connect 未完成或 `chargesEnabled=false` |
| PayNow 不可用 | 账号国家/支付方式未开 SGD PayNow |
| 双发券 | 已靠 `stripeSessionId` 幂等；勿重复配多个 webhook 且逻辑错误 |

---

## F. 代码入口

| 功能 | 路径 |
|------|------|
| 购券 Checkout | `POST /api/voucher/checkout` |
| 支付确认 | `POST /api/voucher/confirm` + webhook |
| 商户充值 | `POST /api/stripe/checkout` |
| Connect | `GET/POST /api/stripe/account` |
| 提现 | `POST /api/stripe/withdraw` |
| Webhook | `POST /api/stripe/webhook` |
