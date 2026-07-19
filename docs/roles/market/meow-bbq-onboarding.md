# Meow BBQ 开户与第一张券 — 操作清单

> 试点 #1 自营店 · 大股东自测用 · 每晚约 1 小时可拆成 3 晚  
> 环境：本地 `http://localhost:3000` 或生产域名（以实际为准）  
> 建议：无痕窗口，避免旧 cookie

**准备好的信息**

| 字段 | 填什么 |
|------|--------|
| 邮箱 | `meow.jianfeng@gmail.com` |
| 手机 | `91251676`（店务联系；店员邀请用手机号） |
| 公司 | Uncle Meow Pte. Ltd. |
| 品牌 | Meow BBQ 猫抓烤肉 |
| UEN | `202216301G` |
| 门店 | Meow BBQ Vivo City（地址：Google Maps「Meow BBQ Vivo City」复制） |
| 品类 | 选 **餐饮 / Food & Dining** |
| 英文 slug 建议 | `meow-bbq`（设置页仅允许 a-z、0-9、连字符） |

### 生产进度（2026-07-18）

| 项 | 状态 |
|----|------|
| 生产部署 | ✅ `release-20260718-215555` · https://wemembers.store |
| Schema（含 `businessUen`） | ✅ `prisma db push` 已同步 |
| 企业注册 | ✅ Playwright 生产注册通过（邮箱 + UEN + 密码） |
| 登录 | 邮箱 `meow.jianfeng@gmail.com` · 临时密码由 Playwright 写入（见对话记录 / `MEOW_PASSWORD`），**请立刻在设置中改密** |
| slug | `meow-bbq` |
| Vivo City 门店 | ✅ 已创建 · 地址 `#02-156/157`（生产已改） |
| 门店编辑 UI | 进门店详情 →「编辑名称 / 地址 / 电话」（部署后可见） |
| 代金券 / 抽奖活动 | ⏳ 未做（第 1–2 晚） |

复跑注册 E2E（会先要求库中无该邮箱，或先清账号）：

```bash
PLAYWRIGHT_BASE_URL=https://wemembers.store npx playwright test \
  tests/e2e/meow-bbq-register-prod.spec.ts --config=playwright.prod.config.ts
```

**验证码注意**

- 本地默认 `MESSAGING_MODE` 非 `live` 时，邮件/短信**不会真发**，验证码在**服务端日志**（跑 `npm run dev` 的终端）里。  
- 生产 `MESSAGING_MODE=live` 时，验证码发到邮箱。

---

## 第 0 晚（约 30–40 分钟）：企业号 + 设置 + 门店 + 贴码路径

### Step 1 — 注册企业

| | |
|--|--|
| **路径** | `/auth/register` |
| **操作** | ① 角色选 **商家 / Business** ② 邮箱 `meow.jianfeng@gmail.com` ③ 公司名 `Uncle Meow Pte. Ltd.` ④ UEN `202216301G` ⑤ 品类餐饮 ⑥ 密码 ≥6 位 ⑦ 收/抄验证码完成注册 |
| **期望** | 成功后跳到 `/business/stores`（「请添加第一家门店」） |
| **☐** | |

> 若该邮箱已注册：改走 `/auth/login`，选商家，邮箱 + 密码登录 → `/business`。

### Step 2 — 企业设置（品牌与链接）

| | |
|--|--|
| **路径** | `/business/settings`（底栏或菜单进「设置」） |
| **操作** | 公司名确认 `Uncle Meow Pte. Ltd.`；英文标识设为 `meow-bbq`；联系人可写你的姓名；手机可填 `91251676`；**保存** |
| **期望** | 成功提示；刷新后仍在；预览链接带 `/shop/meow-bbq/...` |
| **☐** | |

### Step 3 — 添加 Vivo City 门店

| | |
|--|--|
| **路径** | `/business/stores` |
| **操作** | 点「+ 新增门店」→ 名称 `Meow BBQ Vivo City` → 地址粘贴 Maps → 电话 `91251676` → 创建 |
| **期望** | 列表出现该店 + 小二维码 +「进入门店 →」 |
| **☐** | |

> I0 验收写「加 2 店」时可再加一家测试店（如「Meow BBQ 测试」）；真试点 1 店够用。

### Step 4 — 进店：二维码 / 顾客页 / 核销入口

| | |
|--|--|
| **路径** | `/business/stores/[门店id]`（点「进入门店」） |
| **操作** | ① 看「本店二维码」与顾客页链接 ② 新标签打开「顾客页」 ③ 点「本店核销」→ 应到 `/business/scan?storeId=...` 且带店名 |
| **期望** | 顾客页能打开；核销页不 500；无 storeId 时 `/business/scan` 会先让选店 |
| **☐** | |

### Step 5 — 公司 Dashboard 一眼看

| | |
|--|--|
| **路径** | `/business` |
| **操作** | 确认有公司汇总 + 门店入口；**没有**全局「当前门店」切换器 |
| **☐** | |

**第 0 晚完成标准：** 能注册/登录 → 设置 slug → 有 Vivo 店 → 能开顾客页与核销页。  
（对应 I0 验收 B1–B7 主干。）

---

## 第 1 晚（约 30–40 分钟）：代金券 / 折扣购券活动

Meow BBQ 的「代金券」在产品里主要有两条线，**试点优先走活动模板**（可购、可核销、路径短）：

### 推荐 A — 折扣代金券活动（购券用，无抽奖）

| | |
|--|--|
| **路径** | `/business/campaigns/new` |
| **操作** | ① 选模板 **「折扣代金券」** ② 名称例：`Meow BBQ 入会代金券` ③ 折扣建议先 **20%**（≥8%） ④ 面额档位按默认 50/100/200 或按需勾选 ⑤ 日期约 30 天 ⑥ 创建并确认 **active/上线** |
| **期望** | `/business/campaigns` 列表可见；活动有分享/购券链接（页内 `CampaignShare` 等） |
| **☐** | |

**顾客侧自测（第二个浏览器/无痕，顾客号）：**

1. 打开活动/门店购券页（从活动分享或 `/voucher/{slug}`）  
2. 选面额 → 走支付或测试购券路径（本地无 Stripe 完整闭环时，以能看到购券页为准）  
3. 企业号从门店进 **本店核销** 试扫/试核销  

> Stripe 真卡支付：I0 可不强求；I1 再按 `docs/main-scenarios-checklist.md` 补。

### 可选 B — 传统「领券」券（积分/领用型）

| | |
|--|--|
| **路径** | `/business/coupons/new` |
| **操作** | 类型选 **定额减免**（如 S$15）→ 标题 `猫抓烤肉 S$15 代金券` → 有效天数/数量 → 发布 |
| **期望** | `/business/coupons` 可见；顾客可领（视配置） |
| **☐** | |

**第 1 晚完成标准：** 至少有一张 **可讲的代金券路径**（优先活动模板 A）。

---

## 第 2 晚（约 30–40 分钟）：抽奖券 + 店员（按能力）

### Step 6 — 买券抽奖活动

| | |
|--|--|
| **路径** | `/business/campaigns/new` |
| **操作** | ① 选 **「梦想大奖池」** ② 名称例：`Meow BBQ 夏日抽奖` ③ 大奖名称/图标按店内能给的奖品改（可先小目标金额） ④ 面额档位建议先只开 **S$50** 控预算 ⑤ 创建并上线 |
| **期望** | 活动详情可分享；规则可对店员一句话说清：买券 → 即时小奖 + 余额到店核销 |
| **☐** | |

演示话术（对内）：

> 顾客付一笔买券 → 当场有小奖 → 余额到店吃烤肉核销；一部分核销贡献进大奖池。

### Step 7 — 店员账号（现状说明）

| | |
|--|--|
| **产品行为** | 店员用 **手机号** 绑定门店；登录后只能核销，不能管券/活动 |
| **API** | `POST /api/business/stores/{storeId}/staff`  
| | Body: `{ "phone": "91251676", "displayName": "店长小王" }` |
| **UI** | 门店详情页 **目前只能展示店员列表，没有「添加店员」表单**（已知缺口） |

**I0 可行做法（任选）：**

1. **你本人企业号核销**（从门店点「本店核销」）— 试点自测足够  
2. 浏览器登录企业号后，在 DevTools Console 或用 curl 调 API 邀请店员手机号  
3. 把「添加店员 UI」记入 product backlog（P1 B-11 相关），I1 再做  

店员登录：`/auth/login` → 商家/店员意图 → **手机号 + 密码**；若无密码，用验证码登录后设密码。

| **☐** 已确认：本店可用企业号核销，或已成功绑 1 个店员手机 |

---

## 三晚总验收（Meow BBQ 自营试点）

| # | 项 | ☐ |
|---|-----|---|
| M1 | 企业号邮箱登录稳定 | |
| M2 | slug `meow-bbq` + UEN 正确 | |
| M3 | Vivo City 门店 + 二维码/顾客页 | |
| M4 | 本店核销页可用 | |
| M5 | 至少 1 个折扣代金券活动 | |
| M6 | 至少 1 个抽奖活动（可小预算） | |
| M7 | 能对店员讲清：贴码 → 顾客买/领 → 到店核销 | |

全部勾完 → 在 `docs/roles/product/acceptance.md` 知悉栏签日期，并对照跑一遍正式 I0 验收表。

---

## 路径速查

| 场景 | URL |
|------|-----|
| 注册 | `/auth/register` |
| 登录 | `/auth/login` |
| 企业首页 | `/business` |
| 设置 | `/business/settings` |
| 门店列表 | `/business/stores` |
| 门店详情 | `/business/stores/[id]` |
| 核销 | `/business/scan?storeId=...` |
| 活动列表 / 新建 | `/business/campaigns` · `/business/campaigns/new` |
| 传统券 | `/business/coupons` · `/business/coupons/new` |
| 顾客门店页 | `/shop/meow-bbq/{storeSlug}`（设好 slug 后） |

---

## 明确先不做（避免跑偏）

- 不做 PIN 登录  
- 不投广告  
- 不先做跨店结算报表  
- 不先上复杂店员 HR；I0 你自己核销即可  
- Token 充值不作为卖点  
- 实体券（印刷代金/抽奖）→ **I1 · B-15**，规则已拍板见 `docs/company/decisions/2026-07-18-physical-tickets.md`  

